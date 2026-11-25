import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";

import {
  connectDatabases,
  closeDatabases,
  getMainDB,
  getAuditDB,
} from "../src/config/database.js";

import {
  provisionAdmin,
} from "../src/services/admin-provision.service.js";

import {
  provisionDataManager,
} from "../src/services/data-manager-admin.service.js";

const API = "http://127.0.0.1:5000/api/v1";

const ADMIN = "/p14/admin/dataset-proposals";
const MANAGER = "/p14/data-manager";
const HISTORY = `${MANAGER}/dataset-proposals`;

const marker = randomBytes(8).toString("hex");

const localityId = `BD-TEST-${marker.toUpperCase()}`;

const createdEmails = [];

let connected = false;
let passed = 0;
let managerId;
let adminId;
let createProposalId;

function account(role) {
  return {
    name: `Approval Test ${role}`,
    email: `approval-${role}-${marker}@example.com`,
    password: randomBytes(24).toString("hex"),
  };
}

const merchant = account("merchant");
const manager = account("manager");
const otherManager = account("other");
const admin = account("admin");

const locality = {
  nameEn: `Synthetic Locality ${marker}`,
  nameBn: `পরীক্ষামূলক এলাকা ${marker}`,

  areaEn: "Synthetic Area",
  areaBn: "পরীক্ষামূলক অঞ্চল",

  districtEn: "Synthetic District",
  districtBn: "পরীক্ষামূলক জেলা",

  divisionEn: "Synthetic Division",
  divisionBn: "পরীক্ষামূলক বিভাগ",
};

const decisionReason =
  "Synthetic integration test decision only.";

async function api(endpoint, options = {}) {
  const {
    method = "GET",
    cookie,
    body,
    expected = 200,
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
    },

    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : {}),

    signal: AbortSignal.timeout(60000),
  });

  const result = await response.json();

  if (!response.ok) {
    console.log(
      "[API RESPONSE]",
      result.code ?? "UNKNOWN_ERROR",
      "-",
      result.message ?? ""
    );
  }

  console.log(
    `[API] ${method} ${endpoint} -> ${response.status}`
  );

  const allowed = Array.isArray(expected)
    ? expected
    : [expected];

  assert.ok(
    allowed.includes(response.status),

    `${endpoint}: expected ${allowed.join("/")} but received ${response.status}. ${result.code ?? ""} ${result.message ?? ""}`
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

  const match = (
    response.headers.get("set-cookie") ?? ""
  ).match(
    /(?:^|,\s*)(thikanahub_session=[^;,\s]+)/
  );

  assert.ok(match, "Session cookie missing.");

  return match[1];
}

async function group(title, action) {
  await action();

  passed++;

  console.log(`\n[PASS ${passed}/8] ${title}\n`);
}

async function run() {
  assert.equal(
    process.env.NODE_ENV,
    "development",
    "Development environment required."
  );

  let merchantCookie;
  let managerCookie;
  let otherCookie;
  let adminCookie;

  let updateProposalId;
  let staleLocalityProposalId;

  let aliasProposalId;
  let landmarkProposalId;

  let staleTermProposalId;

  try {
    await connectDatabases();

    connected = true;

    const db = getMainDB();

    const localities = db.collection("localities");

    assert.equal(
      await localities.countDocuments({ id: localityId }),
      0,
      "Synthetic locality ID already exists."
    );

    async function readLocality() {
      return localities.findOne({ id: localityId });
    }

    async function localityProposal(
      operation,
      names
    ) {
      const { result } = await api(
        `${MANAGER}/locality-proposals`,

        {
          method: "POST",
          cookie: managerCookie,
          expected: 201,

          body: {
            operation,
            localityId,
            locality: names,
            reason: "Synthetic locality approval integration test.",
            evidence: "Synthetic test only.",
          },
        }
      );

      assert.equal(result.item.status, "pending");

      return result.item.proposalId;
    }

    async function termProposal(
      field,
      operation,
      term
    ) {
      const { result } = await api(
        `${MANAGER}/term-proposals`,

        {
          method: "POST",
          cookie: managerCookie,
          expected: 201,

          body: {
            localityId,
            field,
            operation,
            term,
            reason: "Synthetic term approval integration test.",
            evidence: "Synthetic test only.",
          },
        }
      );

      return result.item.proposalId;
    }

    async function decide(
      kind,
      id,
      action = "approve",
      expected = 200,
      options = {}
    ) {
      return api(
        `${ADMIN}/${kind}/${id}/decision`,

        {
          method: "POST",
          cookie: adminCookie,
          expected,

          body: {
            action,
            reason: decisionReason,
          },

          ...options,
        }
      );
    }

    // =================================
    // GROUP 01 — ADMIN AUTHORIZATION
    // =================================

    await group(
      "Admin provisioning and role isolation",

      async () => {
        await api("/health");

        for (const user of [
          merchant,
          manager,
          otherManager,
          admin,
        ]) {
          await register(user);
        }

        const oldAdminCookie = await login(admin);

        const managerResult =
          await provisionDataManager(manager.email);

        await provisionDataManager(otherManager.email);

        const adminResult =
          await provisionAdmin(admin.email);

        managerId = new ObjectId(managerResult.userId);
        adminId = new ObjectId(adminResult.userId);

        assert.equal(adminResult.role, "admin");

        await assert.rejects(
          () => provisionAdmin(admin.email)
        );

        await api(`${ADMIN}/locality`, {
          cookie: oldAdminCookie,
          expected: 401,
        });

        merchantCookie = await login(merchant);
        managerCookie = await login(manager);
        otherCookie = await login(otherManager);
        adminCookie = await login(admin);

        await api(`${ADMIN}/locality`, {
          expected: 401,
        });

        for (const cookie of [
          merchantCookie,
          managerCookie,
        ]) {
          await api(`${ADMIN}/locality`, {
            cookie,
            expected: 403,
          });
        }

        await api(`${ADMIN}/locality`, {
          cookie: adminCookie,
        });

        await api(`${MANAGER}/localities`, {
          cookie: adminCookie,
          expected: 403,
        });
      }
    );

    // =================================
    // GROUP 02 — PENDING PROPOSAL
    // =================================

    await group(
      "Pending proposal and decision validation",

      async () => {
        createProposalId =
          await localityProposal("create", locality);

        assert.equal(await readLocality(), null);

        const detail = await api(
          `${ADMIN}/locality/${createProposalId}`,
          { cookie: adminCookie }
        );

        assert.equal(detail.result.item.status, "pending");

        await decide(
          "locality",
          createProposalId,
          "approve",
          403,
          { cookie: managerCookie }
        );

        await decide(
          "locality",
          createProposalId,
          "approve",
          403,
          { origin: "https://untrusted.example.com" }
        );

        await decide(
          "locality",
          createProposalId,
          "approve",
          400,
          {
            body: {
              action: "approve",
              reason: decisionReason,
              status: "approved",
            },
          }
        );

        await decide(
          "locality",
          createProposalId,
          "approve",
          400,
          {
            body: {
              action: "approve",
              reason: "abc",
            },
          }
        );

        await api(`${ADMIN}/unknown`, {
          cookie: adminCookie,
          expected: 400,
        });

        await api(`${ADMIN}/locality?limit=51`, {
          cookie: adminCookie,
          expected: 400,
        });

        assert.equal(await readLocality(), null);
      }
    );

    // =================================
    // GROUP 03 — CONCURRENT APPROVAL
    // =================================

    await group(
      "Transactional publication and concurrent approval",

      async () => {
        const settled = await Promise.allSettled([
          decide(
            "locality",
            createProposalId,
            "approve",
            [200, 409]
          ),

          decide(
            "locality",
            createProposalId,
            "approve",
            [200, 409]
          ),
        ]);

        for (const item of settled) {
          if (item.status === "rejected") {
            throw item.reason;
          }
        }

        const results = settled.map(
          item => item.value
        );

        assert.deepEqual(
          results.map(item => item.status).sort(),
          [200, 409]
        );

        const record = await readLocality();

        assert.ok(record);
        assert.equal(record.approved, true);

        const baseline = await localities.findOne(
          {
            approved: true,
            id: { $ne: localityId },
          },
          {
            projection: {
              datasetVersion: 1,
            },
          }
        );

        assert.ok(
          baseline &&
          baseline.datasetVersion !== undefined,
          "Existing dataset version is missing."
        );

        assert.deepEqual(
          record.datasetVersion,
          baseline.datasetVersion,
          "Published locality dataset version mismatch."
        );

        console.log(
          "[PASS] Published dataset version:",
          record.datasetVersion
        );

        assert.equal(
          record.nameEn,
          locality.nameEn
        );

        assert.equal(
          await localities.countDocuments({
            id: localityId,
          }),
          1
        );

        const proposal = await db
          .collection("locality_proposals")
          .findOne({
            _id: new ObjectId(createProposalId),
          });

        assert.equal(proposal.status, "approved");

        assert.equal(
          String(proposal.approvalDecision.decidedBy),
          String(adminId)
        );

        assert.equal(
          proposal.approvalDecision.published,
          true
        );

        await api(
          `${MANAGER}/localities/${localityId}`,
          { cookie: managerCookie }
        );

        await decide(
          "locality",
          createProposalId,
          "reject",
          409
        );
      }
    );

    // =================================
    // GROUP 04 — LOCALITY UPDATE
    // =================================

    await group(
      "Locality update and stale dataset conflict",

      async () => {
        const first = {
          ...locality,
          nameEn: `Updated Locality ${marker}`,
        };

        const second = {
          ...locality,
          nameEn: `Stale Locality ${marker}`,
        };

        updateProposalId =
          await localityProposal("update", first);

        staleLocalityProposalId =
          await localityProposal("update", second);

        await decide("locality", updateProposalId);

        const published = await readLocality();

        assert.equal(published.nameEn, first.nameEn);

        const stale = await decide(
          "locality",
          staleLocalityProposalId,
          "approve",
          409
        );

        assert.equal(
          stale.result.code,
          "DATASET_VERSION_CONFLICT"
        );

        assert.deepEqual(
          await readLocality(),
          published
        );

        const stored = await db
          .collection("locality_proposals")
          .findOne({
            _id: new ObjectId(staleLocalityProposalId),
          });

        assert.equal(stored.status, "pending");

        await decide(
          "locality",
          staleLocalityProposalId,
          "reject"
        );
      }
    );

    // =================================
    // GROUP 05 — TERM PUBLICATION
    // =================================

    await group(
      "Alias and landmark publication and removal",

      async () => {
        const alias = `Test Alias ${marker} 10`;
        const landmark = `Test Landmark ${marker}`;

        aliasProposalId = await termProposal(
          "aliases",
          "add",
          alias
        );

        assert.deepEqual(
          (await readLocality()).aliases,
          []
        );

        await decide("term", aliasProposalId);

        assert.ok(
          (await readLocality()).aliases.includes(alias)
        );

        landmarkProposalId = await termProposal(
          "landmarks",
          "add",
          landmark
        );

        await decide("term", landmarkProposalId);

        assert.ok(
          (await readLocality()).landmarks.includes(
            landmark
          )
        );

        const removal = await termProposal(
          "aliases",
          "remove",
          alias
        );

        await decide("term", removal);

        assert.ok(
          !(await readLocality()).aliases.includes(alias)
        );

        assert.ok(
          (await readLocality()).landmarks.includes(
            landmark
          )
        );
      }
    );

    // =================================
    // GROUP 06 — STALE TERM PROTECTION
    // =================================

    await group(
      "Stale term protection and transaction integrity",

      async () => {
        const first = await termProposal(
          "areaAliases",
          "add",
          `Area Alias A ${marker}`
        );

        staleTermProposalId = await termProposal(
          "areaAliases",
          "add",
          `Area Alias B ${marker}`
        );

        await decide("term", first);

        const before = await readLocality();

        const stale = await decide(
          "term",
          staleTermProposalId,
          "approve",
          409
        );

        assert.equal(
          stale.result.code,
          "DATASET_VERSION_CONFLICT"
        );

        assert.deepEqual(
          await readLocality(),
          before
        );

        const proposal = await db
          .collection("locality_term_proposals")
          .findOne({
            _id: new ObjectId(staleTermProposalId),
          });

        assert.equal(proposal.status, "pending");
      }
    );

    // =================================
    // GROUP 07 — DECISION HISTORY
    // =================================

    await group(
      "Rejection, decision history and owner isolation",

      async () => {
        const before = await readLocality();

        const rejected = await decide(
          "term",
          staleTermProposalId,
          "reject"
        );

        assert.equal(
          rejected.result.item.status,
          "rejected"
        );

        assert.equal(
          rejected.result.item.decision.published,
          false
        );

        assert.deepEqual(
          await readLocality(),
          before
        );

        const ownerView = await api(
          `${HISTORY}/locality/${createProposalId}`,
          { cookie: managerCookie }
        );

        assert.equal(
          ownerView.result.item.status,
          "approved"
        );

        assert.equal(
          ownerView.result.item.decision.reason,
          decisionReason
        );

        assert.equal(
          ownerView.result.item.decision.decidedBy,
          undefined
        );

        await api(
          `${HISTORY}/locality/${createProposalId}`,
          {
            cookie: otherCookie,
            expected: 404,
          }
        );

        await api(
          `${HISTORY}/locality/${createProposalId}`,
          {
            cookie: merchantCookie,
            expected: 403,
          }
        );

        const history = await api(
          `${HISTORY}/term/${staleTermProposalId}`,
          { cookie: managerCookie }
        );

        assert.equal(
          history.result.item.status,
          "rejected"
        );

        const page = await api(
          `${ADMIN}/term?status=all&limit=1`,
          { cookie: adminCookie }
        );

        assert.equal(page.result.items.length, 1);

        if (page.result.pagination.hasMore) {
          const next = await api(
            `${ADMIN}/term?status=all&limit=1&cursor=${page.result.pagination.nextCursor}`,
            { cookie: adminCookie }
          );

          assert.notEqual(
            next.result.items[0]?.proposalId,
            page.result.items[0].proposalId
          );
        }
      }
    );

    // =================================
    // GROUP 08 — AUDIT AND LOGOUT
    // =================================

    await group(
      "Separate audit evidence and session protection",

      async () => {
        const audit = getAuditDB();

        const collections =
          await audit.listCollections(
            {},
            { nameOnly: true }
          ).toArray();

        for (const [action, id] of [
          ["DATASET_LOCALITY_APPROVE", createProposalId],
          ["DATASET_LOCALITY_APPROVE", updateProposalId],
          ["DATASET_TERM_APPROVE", aliasProposalId],
          ["DATASET_TERM_APPROVE", landmarkProposalId],
          ["DATASET_TERM_REJECT", staleTermProposalId],
        ]) {
          let found = false;

          for (const { name } of collections) {
            if (name.startsWith("system.")) continue;

            const event = await audit.collection(name)
              .findOne({
                action,

                result: "success",

                targetId: {
                  $in: [id, new ObjectId(id)],
                },

                userId: {
                  $in: [adminId, String(adminId)],
                },
              });

            if (event) {
              found = true;
              break;
            }
          }

          assert.ok(
            found,
            "Missing audit event: " + action
          );
        }

        console.log(
          "[PASS] Approval and rejection audit events verified."
        );

        await api("/auth/logout", {
          method: "POST",
          cookie: adminCookie,
        });

        await api(`${ADMIN}/locality`, {
          cookie: adminCookie,
          expected: 401,
        });
      }
    );

  } finally {
    try {
      if (connected) {
        const db = getMainDB();

        // Only delete the synthetic locality
        // published by this exact test proposal.

        if (createProposalId) {
          await db.collection("localities").deleteOne({
            id: localityId,

            source:
              `Admin-approved proposal ${createProposalId}`,
          });
        }

        if (managerId) {
          for (const collection of [
            "locality_proposals",
            "locality_term_proposals",
          ]) {
            await db.collection(collection).deleteMany({
              localityId,
              requestedBy: managerId,
            });
          }
        }

        if (createdEmails.length > 0) {
          const accounts = await db.collection("users")
            .find(
              {
                email: { $in: createdEmails },
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
          "[CLEANUP] Synthetic locality and proposals removed."
        );

        console.log(
          "[CLEANUP] Test sessions revoked."
        );
      }

    } finally {
      await closeDatabases();
    }
  }

  console.log("\n================================");
  console.log("FINAL DATASET APPROVAL RESULT");
  console.log("Total Test Groups: 8");
  console.log("Passed:", passed);
  console.log("Failed: 0");
  console.log("ALL 8 DATASET APPROVAL TEST GROUPS PASSED");
  console.log("================================\n");
}

run().catch(error => {
  console.error(
    `[FAILED] Completed groups: ${passed}/8`
  );

  console.error(error.stack ?? error.message);

  process.exitCode = 1;
});
