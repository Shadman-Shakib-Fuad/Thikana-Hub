import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { ObjectId } from "mongodb";

import {
  connectDatabases,
  closeDatabases,
  getMainDB,
  getAuditDB,
} from "../src/config/database.js";

import { env } from "../src/config/env.js";

import {
  provisionDataManager,
} from "../src/services/data-manager-admin.service.js";

import {
  decryptData,
  addressAAD,
} from "../src/services/escalation-crypto.service.js";

const API = "http://127.0.0.1:5000/api/v1";
const BASE = "/p14/data-manager/escalations";

const marker = randomBytes(8).toString("hex");

const originalAddress =
  `Synthetic ${marker}, Unknown Locality, Dhaka`;

const investigationNote =
  `Synthetic investigation ${marker}. Review the approved locality dataset again.`;

const reviewerNote =
  "Synthetic review could not identify the locality.";

let passed = 0;
let connected = false;

let jobId;
let merchantId;
let managerId;

const createdEmails = [];

function account(role) {
  return {
    name: `Handoff Test ${role}`,

    email: `handoff-${role}-${marker}@example.com`,

    password: randomBytes(24).toString("hex"),
  };
}

const merchant = account("merchant");
const reviewer = account("reviewer");
const manager = account("manager");

// =====================================
// REQUEST HELPER
// =====================================

async function api(endpoint, options = {}) {
  const {
    method = "GET",
    body,
    cookie,
    expected = 200,
    headers = {},
    origin = "http://localhost:3000",
  } = options;

  const response = await fetch(API + endpoint, {
    method,

    headers: {
      Accept: "application/json",
      Origin: origin,

      ...(cookie ? { Cookie: cookie } : {}),

      ...(body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),

      ...headers,
    },

    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : {}),

    signal: AbortSignal.timeout(45000),
  });

  const result = await response.json();

  console.log(
    `[API] ${method} ${endpoint} -> ${response.status}`
  );

  const allowed = Array.isArray(expected)
    ? expected
    : [expected];

  assert.ok(
    allowed.includes(response.status),

    `${endpoint}: expected ${allowed.join("/")} but received ${response.status}. ${result.code ?? ""}`
  );

  if (response.ok) {
    assert.equal(result.success, true);
  }

  return {
    result,
    response,
    status: response.status,
  };
}

async function register(user) {
  await api("/auth/register", {
    method: "POST",
    body: user,
    expected: 201,
  });

  createdEmails.push(user.email);
}

async function login(user) {
  const { response } = await api("/auth/login", {
    method: "POST",

    body: {
      email: user.email,
      password: user.password,
    },
  });

  const cookie = (
    response.headers.get("set-cookie") ?? ""
  ).match(
    /(?:^|,\s*)(thikanahub_session=[^;,\s]+)/
  );

  assert.ok(cookie, "Session cookie missing.");

  return cookie[1];
}

function reviewerCommand(...args) {
  execFileSync(
    process.execPath,

    ["scripts/reviewer-admin.js", ...args],

    {
      stdio: "inherit",
      timeout: 60000,
    }
  );
}

async function group(title, action) {
  await action();

  passed++;

  console.log(`\n[PASS ${passed}/8] ${title}\n`);
}

// =====================================
// MAIN TEST
// =====================================

async function run() {
  assert.equal(
    process.env.NODE_ENV,
    "development",
    "Development environment required."
  );

  console.log("\nSECURE ESCALATION HANDOFF TEST\n");

  let merchantCookie;
  let reviewerCookie;
  let managerCookie;

  let previousAssignment;
  let before;
  let investigation;
  let nextAssignment;
  let localityId;

  try {
    await connectDatabases();
    connected = true;

    const db = getMainDB();

    const addresses =
      db.collection("address_requests");

    // GROUP 01 — ACCOUNT SETUP

    await group(
      "Authentication and test account setup",

      async () => {
        await api("/health");

        await register(merchant);
        await register(reviewer);
        await register(manager);

        const owner = await db.collection("users")
          .findOne({ email: merchant.email });

        assert.ok(owner);

        merchantId = owner._id;

        reviewerCommand(
          "provision",
          reviewer.email
        );

        const provisioned =
          await provisionDataManager(manager.email);

        assert.equal(
          provisioned.role,
          "data_manager"
        );

        managerId =
          new ObjectId(provisioned.userId);

        merchantCookie = await login(merchant);
        reviewerCookie = await login(reviewer);
        managerCookie = await login(manager);
      }
    );

    // GROUP 02 — ESCALATION

    await group(
      "Create and escalate an address",

      async () => {
        const { result } = await api(
          "/p14/address-resolutions",

          {
            method: "POST",
            cookie: merchantCookie,
            expected: 201,

            body: {
              address: originalAddress,
            },
          }
        );

        jobId = result.jobId;

        assert.match(jobId, /^[a-f0-9]{24}$/i);

        await api("/p14/address-feedback", {
          method: "POST",
          cookie: merchantCookie,

          body: {
            jobId,
            decision: "no_correct_match",
            revision: 0,
          },
        });

        reviewerCommand(
          "assign",
          jobId,
          reviewer.email
        );

        const detail = await api(
          `/p14/reviewer/queue/${jobId}`,

          { cookie: reviewerCookie }
        );

        previousAssignment =
          detail.result.assignedAt;

        const localities = await api(
          `/p14/reviewer/queue/${jobId}/localities`,

          { cookie: reviewerCookie }
        );

        localityId =
          localities.result.items[0]?.localityId;

        assert.ok(
          localityId,
          "An approved locality is required."
        );

        await api(`${BASE}/${jobId}/investigation`, {
          cookie: managerCookie,
          expected: 404,
        });

        await api(
          `/p14/reviewer/queue/${jobId}/decision`,

          {
            method: "POST",
            cookie: reviewerCookie,

            headers: {
              "X-Review-Assignment":
                previousAssignment,
            },

            body: {
              decision: "escalated",
              revision: detail.result.revision,
              note: reviewerNote,
            },
          }
        );

        before = await addresses.findOne({
          _id: new ObjectId(jobId),
          ownerId: merchantId,
        });

        assert.ok(before);

        assert.equal(
          before.reviewAssignment.status,
          "escalated"
        );
      }
    );

    // GROUP 03 — PRIVATE INVESTIGATION

    await group(
      "Authorized investigation and privacy protection",

      async () => {
        const endpoint =
          `${BASE}/${jobId}/investigation`;

        await api(endpoint, {
          expected: 401,
        });

        for (const cookie of [
          merchantCookie,
          reviewerCookie,
        ]) {
          await api(endpoint, {
            cookie,
            expected: 403,
          });
        }

        const { result, response } = await api(
          endpoint,

          { cookie: managerCookie }
        );

        investigation = result.item;

        assert.equal(
          investigation.originalAddress,
          originalAddress
        );

        assert.equal(
          investigation.reviewerNote,
          reviewerNote
        );

        assert.match(
          investigation.version,
          /^[a-f0-9]{64}$/
        );

        assert.equal(
          response.headers.get("cache-control"),
          "no-store"
        );

        assert.deepEqual(
          Object.keys(investigation).sort(),

          [
            "jobId",
            "revision",
            "version",
            "originalAddress",
            "reviewerNote",
            "escalatedAt",
            "reviewStatus",
          ].sort()
        );
      }
    );

    function handoffBody() {
      return {
        revision: investigation.revision,
        version: investigation.version,
        note: investigationNote,
      };
    }

    const handoffEndpoint = () =>
      `${BASE}/${jobId}/handoff`;

    // GROUP 04 — INVALID REQUESTS

    await group(
      "Handoff validation and stale version protection",

      async () => {
        const endpoint = handoffEndpoint();

        await api(endpoint, {
          method: "POST",
          cookie: merchantCookie,
          body: handoffBody(),
          expected: 403,
        });

        await api(endpoint, {
          method: "POST",
          cookie: managerCookie,
          body: handoffBody(),
          origin: "https://untrusted.example.com",
          expected: 403,
        });

        for (const body of [
          { ...handoffBody(), note: "abc" },
          { ...handoffBody(), status: "confirmed" },
          { ...handoffBody(), reviewerId: "invalid" },
        ]) {
          await api(endpoint, {
            method: "POST",
            cookie: managerCookie,
            body,
            expected: 400,
          });
        }

        const staleVersion =
          (investigation.version[0] === "0" ? "1" : "0") +
          investigation.version.slice(1);

        await api(endpoint, {
          method: "POST",
          cookie: managerCookie,
          expected: 409,

          body: {
            ...handoffBody(),
            version: staleVersion,
          },
        });

        await api(endpoint, {
          method: "POST",
          cookie: managerCookie,
          expected: 409,

          body: {
            ...handoffBody(),
            revision: investigation.revision + 1,
          },
        });

        const unchanged = await addresses.findOne({
          _id: new ObjectId(jobId),
        });

        assert.deepEqual(unchanged, before);
      }
    );

    // GROUP 05 — CONCURRENT HANDOFF

    await group(
      "Atomic handoff and encrypted review history",

      async () => {
        const options = {
          method: "POST",
          cookie: managerCookie,
          expected: [200, 404, 409],
          body: handoffBody(),
        };

        const settled = await Promise.allSettled([
          api(handoffEndpoint(), options),
          api(handoffEndpoint(), options),
        ]);

        for (const item of settled) {
          if (item.status === "rejected") {
            throw item.reason;
          }
        }

        const results = settled.map(
          item => item.value
        );

        const successful = results.filter(
          item => item.status === 200
        );

        assert.equal(successful.length, 1);

        nextAssignment =
          successful[0].result.assignedAt;

        assert.notEqual(
          nextAssignment,
          previousAssignment
        );

        const after = await addresses.findOne({
          _id: new ObjectId(jobId),
        });

        assert.equal(
          after.reviewAssignment.status,
          "pending"
        );

        assert.equal(
          String(after.reviewAssignment.reviewerId),
          String(before.reviewAssignment.reviewerId)
        );

        assert.equal(
          after.decision,
          "review_requested"
        );

        assert.equal(after.status, before.status);

        assert.equal(
          after.revision ?? 0,
          before.revision ?? 0
        );

        assert.notEqual(
          after.encryptedPayload.iv,
          before.encryptedPayload.iv
        );

        assert.ok(
          !JSON.stringify(after).includes(marker),
          "Private investigation text stored in plaintext."
        );

        const previousReview =
          after.reviewHistory.at(-1);

        assert.equal(
          previousReview.status,
          "escalated"
        );

        const decrypted = await decryptData(
          after.encryptedPayload,
          env.ADDRESS_ENCRYPTION_KEY,
          addressAAD(after._id, after.ownerId)
        );

        assert.equal(
          decrypted.originalAddress,
          originalAddress
        );

        assert.equal(
          decrypted.reviewOutcome,
          undefined
        );

        const archived =
          decrypted.reviewOutcomeHistory.at(-1);

        assert.equal(
          archived.note,
          reviewerNote
        );

        assert.equal(
          archived.dataManagerHandoff.note,
          investigationNote
        );

        assert.equal(
          archived.dataManagerHandoff.newAssignmentVersion,
          nextAssignment
        );
      }
    );

    // GROUP 06 — REVIEWER HANDOFF CONTEXT

    await group(
      "Reviewer context and queue transition",

      async () => {
        const path =
          `/p14/reviewer/queue/${jobId}/handoff-context`;

        await api(path, { expected: 401 });

        await api(path, {
          cookie: merchantCookie,
          expected: 403,
        });

        await api(path, {
          cookie: managerCookie,
          expected: 403,
        });

        const { result } = await api(path, {
          cookie: reviewerCookie,
        });

        assert.equal(
          result.context.note,
          investigationNote
        );

        assert.equal(
          result.context.assignedAt,
          nextAssignment
        );

        await api(`${BASE}/${jobId}/investigation`, {
          cookie: managerCookie,
          expected: 404,
        });

        const queue = await api(
          `${BASE}?jobId=${jobId}`,

          { cookie: managerCookie }
        );

        assert.equal(queue.result.items.length, 0);

        const merchantView = await api(
          `/p14/merchant-reviews/${jobId}`,

          { cookie: merchantCookie }
        );

        assert.equal(
          merchantView.result.reviewStatus,
          "pending"
        );

        assert.equal(
          merchantView.result.canAccept,
          false
        );

        assert.ok(
          !JSON.stringify(merchantView.result)
            .includes(investigationNote)
        );
      }
    );

    // GROUP 07 — NEW REVIEW AND ACCEPTANCE

    await group(
      "Stale assignment rejection and merchant acceptance",

      async () => {
        const decision = {
          decision: "resolved",

          revision: investigation.revision,

          localityId,

          note: "Synthetic recommendation after handoff.",
        };

        const endpoint =
          `/p14/reviewer/queue/${jobId}/decision`;

        await api(endpoint, {
          method: "POST",
          cookie: reviewerCookie,
          expected: 409,

          headers: {
            "X-Review-Assignment":
              previousAssignment,
          },

          body: decision,
        });

        await api(endpoint, {
          method: "POST",
          cookie: reviewerCookie,

          headers: {
            "X-Review-Assignment":
              nextAssignment,
          },

          body: decision,
        });

        const review = await api(
          `/p14/merchant-reviews/${jobId}`,

          { cookie: merchantCookie }
        );

        assert.equal(
          review.result.reviewStatus,
          "resolved"
        );

        assert.equal(
          review.result.canAccept,
          true
        );

        const accepted = await api(
          `/p14/merchant-reviews/${jobId}/decision`,

          {
            method: "POST",
            cookie: merchantCookie,

            body: {
              decision: "accept",

              revision: review.result.revision,

              reviewVersion:
                review.result.reviewVersion,
            },
          }
        );

        assert.equal(
          accepted.result.status,
          "confirmed"
        );

        assert.equal(
          accepted.result.selectedCandidate.matchType,
          "manual_review"
        );

        assert.equal(
          accepted.result.selectedCandidate.score,
          null
        );

        // Accepted outcome must retain
        // the earlier escalation history.

        const finalRecord = await addresses.findOne({
          _id: new ObjectId(jobId),
        });

        assert.equal(
          finalRecord.decision,
          "confirmed"
        );

        assert.ok(
          finalRecord.reviewHistory.some(
            item => item.status === "escalated"
          )
        );

        const payload = await decryptData(
          finalRecord.encryptedPayload,
          env.ADDRESS_ENCRYPTION_KEY,
          addressAAD(
            finalRecord._id,
            finalRecord.ownerId
          )
        );

        assert.ok(
          payload.reviewOutcomeHistory.some(
            item =>
              item.dataManagerHandoff?.note ===
              investigationNote
          )
        );
      }
    );

    // GROUP 08 — AUDIT AND SESSION

    await group(
      "Audit evidence and logout protection",

      async () => {
        const audit = getAuditDB();

        const collections = await audit.listCollections(
          {},
          { nameOnly: true }
        ).toArray();

        for (const action of [
          "ESCALATION_INVESTIGATION_ACCESS",
          "ESCALATION_REVIEWER_HANDOFF",
        ]) {
          let found = false;

          for (const { name } of collections) {
            if (name.startsWith("system.")) continue;

            const event = await audit.collection(name)
              .findOne({
                action,

                result: "success",

                userId: {
                  $in: [managerId, String(managerId)],
                },

                targetId: {
                  $in: [jobId, new ObjectId(jobId)],
                },
              });

            if (event) {
              assert.ok(
                !JSON.stringify(event).includes(marker),
                "Private text exposed in audit record."
              );

              found = true;
              break;
            }
          }

          assert.ok(found, "Missing audit event: " + action);
        }

        await api("/auth/logout", {
          method: "POST",
          cookie: managerCookie,
        });

        await api(`${BASE}/${jobId}/investigation`, {
          cookie: managerCookie,
          expected: 401,
        });
      }
    );

  } finally {
    try {
      if (connected) {
        const db = getMainDB();

        if (
          merchantId &&
          typeof jobId === "string" &&
          ObjectId.isValid(jobId)
        ) {
          await db.collection("address_requests")
            .deleteOne({
              _id: new ObjectId(jobId),
              ownerId: merchantId,
            });
        }

        if (createdEmails.length > 0) {
          const accounts = await db.collection("users")
            .find(
              {
                email: { $in: createdEmails },
              },
              { projection: { _id: 1 } }
            )
            .toArray();

          await db.collection("sessions").deleteMany({
            userId: {
              $in: accounts.map(user => user._id),
            },
          });
        }

        console.log(
          "[CLEANUP] Synthetic address removed and test sessions revoked."
        );
      }
    } finally {
      await closeDatabases();
    }
  }

  console.log("\n================================");
  console.log("FINAL ESCALATION HANDOFF RESULT");
  console.log("Total Test Groups: 8");
  console.log("Passed:", passed);
  console.log("Failed: 0");
  console.log("ALL 8 HANDOFF TEST GROUPS PASSED");
  console.log("================================\n");
}

run().catch(error => {
  console.error(
    `[FAILED] Completed groups: ${passed}/8`
  );

  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
