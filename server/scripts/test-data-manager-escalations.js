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

import {
  provisionDataManager,
} from "../src/services/data-manager-admin.service.js";

// =====================================
// TEST CONFIGURATION
// =====================================

const API = "http://127.0.0.1:5000/api/v1";
const BASE = "/p14/data-manager/escalations";

const marker = randomBytes(8).toString("hex");

const createdEmails = [];

let connected = false;
let passed = 0;
let jobId = null;
let merchantId = null;

// =====================================
// SYNTHETIC TEST ACCOUNTS
// =====================================

function account(role) {
  return {
    name: `Escalation Test ${role}`,
    email: `esc-${role}-${marker}@example.com`,
    password: randomBytes(24).toString("hex"),
  };
}

const merchant = account("merchant");
const reviewer = account("reviewer");
const manager = account("manager");

// =====================================
// API REQUEST HELPER
// =====================================

async function api(
  endpoint,
  {
    method = "GET",
    body,
    cookie,
    headers = {},
    expected = 200,
  } = {}
) {
  const response = await fetch(API + endpoint, {
    method,

    headers: {
      Accept: "application/json",
      Origin: "http://localhost:3000",

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

  console.log(
    `[API] ${method} ${endpoint} -> ${response.status}`
  );

  const result = await response.json();

  assert.equal(
    response.status,
    expected,
    `${endpoint}: ${result.code ?? ""} ${result.message ?? ""}`
  );

  if (response.ok) {
    assert.equal(result.success, true);
  }

  return { result, response };
}

// =====================================
// AUTHENTICATION HELPERS
// =====================================

async function register(user) {
  await api("/auth/register", {
    method: "POST",
    expected: 201,
    body: user,
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

  const cookie =
    response.headers.get("set-cookie") ?? "";

  const match = cookie.match(
    /(?:^|,\s*)(thikanahub_session=[^;,\s]+)/
  );

  assert.ok(match, "Session cookie missing.");

  return match[1];
}

async function group(title, action) {
  await action();

  passed++;

  console.log(`\n[PASS ${passed}/6] ${title}\n`);
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

// =====================================
// MAIN INTEGRATION TEST
// =====================================

async function run() {
  assert.equal(
    process.env.NODE_ENV,
    "development",
    "Run this test only in development."
  );

  console.log("\nESCALATION INTEGRATION TEST\n");

  let merchantCookie;
  let reviewerCookie;
  let managerCookie;
  let managerId;
  let before;

  try {
    await connectDatabases();

    connected = true;

    const db = getMainDB();
    const addresses = db.collection("address_requests");

    // =================================
    // GROUP 01 — AUTHORIZATION
    // =================================

    await group(
      "Authentication and role protection",

      async () => {
        await api("/health");

        await api(BASE, { expected: 401 });

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

        managerId = new ObjectId(provisioned.userId);

        merchantCookie = await login(merchant);
        reviewerCookie = await login(reviewer);
        managerCookie = await login(manager);

        await api(BASE, {
          cookie: merchantCookie,
          expected: 403,
        });

        await api(BASE, {
          cookie: reviewerCookie,
          expected: 403,
        });

        await api(`${BASE}/statistics`, {
          cookie: merchantCookie,
          expected: 403,
        });
      }
    );

    // =================================
    // GROUP 02 — ESCALATION WORKFLOW
    // =================================

    await group(
      "Create and escalate synthetic address",

      async () => {
        const { result } = await api(
          "/p14/address-resolutions",

          {
            method: "POST",
            cookie: merchantCookie,
            expected: 201,

            body: {
              address:
                `Synthetic ${marker}, Unknown Test Locality, Dhaka`,
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

        assert.ok(detail.result.assignedAt);

        // Pending review must not appear in
        // the active escalation queue.

        const pending = await api(
          `${BASE}?jobId=${jobId}`,

          { cookie: managerCookie }
        );

        assert.equal(pending.result.items.length, 0);

        await api(`${BASE}/${jobId}`, {
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
                detail.result.assignedAt,
            },

            body: {
              decision: "escalated",
              note: "Synthetic escalation integration test only.",
              revision: detail.result.revision,
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

    // =================================
    // GROUP 03 — QUEUE AND STATISTICS
    // =================================

    await group(
      "Escalation queue and statistics",

      async () => {
        const { result } = await api(
          `${BASE}?jobId=${jobId}`,

          { cookie: managerCookie }
        );

        assert.equal(result.items.length, 1);
        assert.equal(result.items[0].jobId, jobId);

        assert.equal(
          result.items[0].reviewStatus,
          "escalated"
        );

        assert.ok(
          !JSON.stringify(result).includes(marker),
          "Address text exposed in escalation queue."
        );

        const stats = await api(
          `${BASE}/statistics`,

          { cookie: managerCookie }
        );

        assert.ok(
          stats.result.summary.totalEscalated >= 1
        );

        const page = await api(
          `${BASE}?limit=1`,

          { cookie: managerCookie }
        );

        assert.equal(page.result.items.length, 1);
        assert.equal(page.result.pagination.limit, 1);

        if (page.result.pagination.hasMore) {
          const next = await api(
            `${BASE}?limit=1&cursor=${page.result.pagination.nextCursor}`,

            { cookie: managerCookie }
          );

          assert.equal(next.result.items.length, 1);

          assert.notEqual(
            next.result.items[0].jobId,
            page.result.items[0].jobId
          );
        } else {
          assert.equal(
            page.result.pagination.nextCursor,
            null
          );
        }
      }
    );

    // =================================
    // GROUP 04 — DETAILS AND PRIVACY
    // =================================

    await group(
      "Escalation details and privacy protection",

      async () => {
        const { result, response } = await api(
          `${BASE}/${jobId}`,

          { cookie: managerCookie }
        );

        assert.equal(result.item.jobId, jobId);

        const allowedFields = [
          "jobId",
          "revision",
          "addressStatus",
          "reviewStatus",
          "assignedAt",
          "escalatedAt",
          "createdAt",
          "updatedAt",
        ].sort();

        assert.deepEqual(
          Object.keys(result.item).sort(),
          allowedFields
        );

        assert.ok(
          !JSON.stringify(result).includes(marker),
          "Private address text exposed."
        );

        assert.equal(
          response.headers.get("cache-control"),
          "no-store"
        );

        for (const cookie of [
          merchantCookie,
          reviewerCookie,
        ]) {
          await api(`${BASE}/${jobId}`, {
            cookie,
            expected: 403,
          });
        }
      }
    );

    // =================================
    // GROUP 05 — INPUT VALIDATION
    // =================================

    await group(
      "Invalid input and unknown request protection",

      async () => {
        for (const suffix of [
          "?limit=0",
          "?limit=51",
          "?unexpected=true",
          "?jobId=invalid",
          "?cursor=invalid",
          `?jobId=${jobId}&cursor=${jobId}`,
          "/invalid",
          "/statistics?unexpected=true",
          `/${jobId}?unexpected=true`,
        ]) {
          await api(BASE + suffix, {
            cookie: managerCookie,
            expected: 400,
          });
        }

        await api(
          `${BASE}/${new ObjectId()}`,

          {
            cookie: managerCookie,
            expected: 404,
          }
        );
      }
    );

    // =================================
    // GROUP 06 — AUDIT AND DATA SAFETY
    // =================================

    await group(
      "Audit evidence, unchanged data and logout",

      async () => {
        const after = await addresses.findOne({
          _id: new ObjectId(jobId),
          ownerId: merchantId,
        });

        assert.deepEqual(
          after,
          before,
          "Read-only API modified address data."
        );

        const review = await api(
          `/p14/merchant-reviews/${jobId}`,

          { cookie: merchantCookie }
        );

        assert.equal(
          review.result.reviewStatus,
          "escalated"
        );

        assert.equal(
          review.result.canAccept,
          false
        );

        // Verify separate audit database.

        const audit = getAuditDB();

        const collections = await audit.listCollections(
          {},
          { nameOnly: true }
        ).toArray();

        let found = false;

        for (const { name } of collections) {
          if (name.startsWith("system.")) continue;

          const event = await audit.collection(name)
            .findOne({
              action: "DATA_MANAGER_ESCALATION_ACCESS",

              result: "success",

              targetId: {
                $in: [jobId, new ObjectId(jobId)],
              },

              userId: {
                $in: [managerId, String(managerId)],
              },
            });

          if (event) {
            found = true;
            break;
          }
        }

        assert.ok(
          found,
          "Successful escalation access audit event missing."
        );

        console.log("[PASS] Separate audit event verified.");

        await api("/auth/logout", {
          method: "POST",
          cookie: managerCookie,
        });

        await api(BASE, {
          cookie: managerCookie,
          expected: 401,
        });
      }
    );

  } finally {
    try {
      if (connected) {
        const db = getMainDB();

        // Remove only the address belonging to
        // this specific synthetic merchant.

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
                email: {
                  $in: createdEmails,
                },
              },
              {
                projection: { _id: 1 },
              }
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
  console.log("FINAL ESCALATION API RESULT");
  console.log("Total Test Groups: 6");
  console.log("Passed:", passed);
  console.log("Failed: 0");
  console.log("ALL 6 ESCALATION TEST GROUPS PASSED");
  console.log("================================\n");
}

run().catch(error => {
  console.error(
    `[FAILED] Completed groups: ${passed}/6`
  );

  console.error(error.stack ?? error.message);

  process.exitCode = 1;
});
