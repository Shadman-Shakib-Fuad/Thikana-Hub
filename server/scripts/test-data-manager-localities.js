import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  connectDatabases,
  closeDatabases,
  getMainDB,
} from "../src/config/database.js";

import {
  provisionDataManager,
} from "../src/services/data-manager-admin.service.js";

const API = "http://127.0.0.1:5000/api/v1";
const ORIGIN = "http://localhost:3000";

const BASE = "/p14/data-manager";
const LOCALITIES = `${BASE}/localities`;
const PROPOSALS = `${BASE}/locality-proposals`;

const marker = randomBytes(8).toString("hex");

const account = {
  name: "Data Manager Locality Test",

  email: `dm-locality-${marker}@example.com`,

  password: randomBytes(24).toString("hex"),
};

const syntheticId =
  `BD-TEST-${marker.toUpperCase()}`;

let cookie;
let managerId;
let passed = 0;
let databaseConnected = false;
let accountCreated = false;

let existing;
let createProposalId;
let updateProposalId;

// =====================================
// API REQUEST HELPER
// =====================================

async function api(
  endpoint,
  {
    method = "GET",
    body,
    session = cookie,
    origin = ORIGIN,
    expected = 200,
  } = {}
) {
  const response = await fetch(
    `${API}${endpoint}`,
    {
      method,

      headers: {
        Accept: "application/json",

        Origin: origin,

        ...(session
          ? { Cookie: session }
          : {}),

        ...(body !== undefined
          ? {
              "Content-Type":
                "application/json",
            }
          : {}),
      },

      ...(body !== undefined
        ? {
            body: JSON.stringify(body),
          }
        : {}),

      signal: AbortSignal.timeout(45000),
    }
  );

  const result = await response.json();

  console.log(
    `[API] ${method} ${endpoint} -> ${response.status}`
  );

  assert.equal(
    response.status,
    expected,
    `${endpoint}: ${result.code ?? ""} ${result.message ?? ""}`
  );

  if (expected >= 200 && expected < 300) {
    assert.equal(result.success, true);
  }

  return { result, response };
}

// =====================================
// LOGIN HELPER
// =====================================

async function login() {
  const { response } = await api(
    "/auth/login",
    {
      method: "POST",
      session: null,

      body: {
        email: account.email,
        password: account.password,
      },
    }
  );

  const value =
    response.headers.get("set-cookie") ?? "";

  const match = value.match(
    /(?:^|,\s*)(thikanahub_session=[^;,\s]+)/
  );

  assert.ok(match, "Session cookie missing");

  return match[1];
}

async function group(title, action) {
  await action();

  passed++;

  console.log(
    `\n[PASS ${passed}/8] ${title}\n`
  );
}

// =====================================
// MAIN INTEGRATION TEST
// =====================================

async function run() {
  console.log(
    "\nDATA MANAGER LOCALITY API TEST\n"
  );

  try {
    await connectDatabases();

    databaseConnected = true;

    const db = getMainDB();

    const localities =
      db.collection("localities");

    const proposals =
      db.collection("locality_proposals");

    // =================================
    // GROUP 01
    // =================================

    await group(
      "Authentication and role isolation",

      async () => {
        await api("/health");

        await api(LOCALITIES, {
          session: null,
          expected: 401,
        });

        await api("/auth/register", {
          method: "POST",
          expected: 201,
          body: account,
        });

        accountCreated = true;

        cookie = await login();

        await api(LOCALITIES, {
          expected: 403,
        });

        await api(PROPOSALS, {
          expected: 403,
        });

        const result =
          await provisionDataManager(
            account.email
          );

        assert.equal(
          result.role,
          "data_manager"
        );

        // Previous merchant session
        // must no longer be valid.

        await api(LOCALITIES, {
          expected: 401,
        });

        cookie = await login();

        const manager = await db
          .collection("users")
          .findOne({
            email: account.email,
          });

        assert.ok(manager);

        managerId = manager._id;
      }
    );

    // =================================
    // GROUP 02
    // =================================

    await group(
      "Locality listing and cursor pagination",

      async () => {
        const { result } = await api(
          `${LOCALITIES}?approved=true&limit=1`
        );

        assert.equal(
          result.items.length,
          1
        );

        existing = result.items[0];

        assert.equal(
          existing.approved,
          true
        );

        assert.ok(existing.localityId);

        assert.equal(
          result.pagination.limit,
          1
        );

        assert.equal(
          result.pagination.hasMore,
          true
        );

        const next = await api(
          `${LOCALITIES}?approved=true&limit=1&cursor=${encodeURIComponent(result.pagination.nextCursor)}`
        );

        assert.equal(
          next.result.items.length,
          1
        );

        assert.notEqual(
          next.result.items[0].localityId,
          existing.localityId
        );
      }
    );

    // =================================
    // GROUP 03
    // =================================

    await group(
      "Bangla and English locality search",

      async () => {
        for (const query of [
          existing.locality.nameEn,
          existing.locality.nameBn,
        ]) {
          assert.ok(query);

          const { result } = await api(
            `${LOCALITIES}?q=${encodeURIComponent(query)}&limit=50`
          );

          assert.ok(
            result.items.some(
              (item) =>
                item.localityId ===
                existing.localityId
            )
          );
        }

        const empty = await api(
          `${LOCALITIES}?q=${encodeURIComponent(`unknown-${marker}`)}`
        );

        assert.equal(
          empty.result.items.length,
          0
        );

        // Regex symbols are treated as
        // literal search text.

        await api(
          `${LOCALITIES}?q=${encodeURIComponent(".*")}`
        );
      }
    );

    // =================================
    // GROUP 04
    // =================================

    await group(
      "Input validation and locality details",

      async () => {
        await api(
          `${LOCALITIES}?limit=0`,
          { expected: 400 }
        );

        await api(
          `${LOCALITIES}?limit=51`,
          { expected: 400 }
        );

        await api(
          `${LOCALITIES}?unexpected=true`,
          { expected: 400 }
        );

        await api(
          `${LOCALITIES}?approved=invalid`,
          { expected: 400 }
        );

        const { result } = await api(
          `${LOCALITIES}/${existing.localityId}`
        );

        assert.equal(
          result.item.localityId,
          existing.localityId
        );

        await api(
          `${LOCALITIES}/${syntheticId}`,
          { expected: 404 }
        );
      }
    );

    const createInput = {
      operation: "create",

      localityId: syntheticId,

      locality: {
        ...existing.locality,

        nameEn: "Synthetic Test Locality",

        nameBn: "পরীক্ষামূলক এলাকা",
      },

      reason:
        "Automated integration testing only.",

      evidence:
        "Synthetic test record. Not geographic evidence.",
    };

    // =================================
    // GROUP 05
    // =================================

    await group(
      "Proposal validation and privilege protection",

      async () => {
        await api(PROPOSALS, {
          method: "POST",

          expected: 400,

          body: {
            ...createInput,

            status: "approved",
          },
        });

        await api(PROPOSALS, {
          method: "POST",

          expected: 400,

          body: {
            ...createInput,

            approved: true,
          },
        });

        await api(PROPOSALS, {
          method: "POST",

          expected: 400,

          body: {
            ...createInput,

            reason: "abc",
          },
        });

        await api(PROPOSALS, {
          method: "POST",

          origin: "https://untrusted.example.com",

          expected: 403,

          body: createInput,
        });

        await api(PROPOSALS, {
          method: "POST",

          expected: 409,

          body: {
            ...createInput,

            localityId: existing.localityId,
          },
        });
      }
    );

    // =================================
    // GROUP 06
    // =================================

    await group(
      "Create proposal without modifying approved data",

      async () => {
        const { result } = await api(
          PROPOSALS,
          {
            method: "POST",

            expected: 201,

            body: createInput,
          }
        );

        createProposalId =
          result.item.proposalId;

        assert.equal(
          result.item.status,
          "pending"
        );

        assert.equal(
          result.item.operation,
          "create"
        );

        // A proposal must never immediately
        // enter the live matching dataset.

        assert.equal(
          await localities.findOne({
            id: syntheticId,
          }),

          null
        );
      }
    );

    // =================================
    // GROUP 07
    // =================================

    await group(
      "Update proposal and unchanged live locality",

      async () => {
        const before =
          await localities.findOne({
            id: existing.localityId,
          });

        const { result } = await api(
          PROPOSALS,
          {
            method: "POST",

            expected: 201,

            body: {
              operation: "update",

              localityId: existing.localityId,

              locality: {
                ...existing.locality,

                nameEn:
                  `${existing.locality.nameEn} Test`,
              },

              reason:
                "Synthetic update proposal test only.",

              evidence:
                "Automated test. Do not approve.",
            },
          }
        );

        updateProposalId =
          result.item.proposalId;

        assert.equal(
          result.item.status,
          "pending"
        );

        const after =
          await localities.findOne({
            id: existing.localityId,
          });

        assert.deepEqual(
          after,
          before,

          "Live locality was unexpectedly modified"
        );

        const saved =
          await proposals.findOne({
            requestedBy: managerId,

            operation: "update",

            localityId: existing.localityId,
          });

        assert.ok(saved);

        assert.equal(
          saved.baseLocality.nameEn,
          existing.locality.nameEn
        );
      }
    );

    // =================================
    // GROUP 08
    // =================================

    await group(
      "Own proposal listing and session protection",

      async () => {
        const { result } = await api(
          `${PROPOSALS}?limit=20`
        );

        assert.equal(
          result.items.length,
          2
        );

        assert.ok(
          result.items.some(
            (item) =>
              item.proposalId === createProposalId
          )
        );

        assert.ok(
          result.items.some(
            (item) =>
              item.proposalId === updateProposalId
          )
        );

        assert.ok(
          result.items.every(
            (item) =>
              item.status === "pending"
          )
        );

        await api("/auth/logout", {
          method: "POST",
        });

        await api(PROPOSALS, {
          expected: 401,
        });
      }
    );

    console.log(
      "\n================================"
    );

    console.log(
      "FINAL DATA MANAGER LOCALITY RESULT"
    );

    console.log("Total Test Groups: 8");
    console.log("Passed:", passed);
    console.log("Failed: 0");

    console.log(
      "ALL 8 LOCALITY TEST GROUPS PASSED"
    );

    console.log(
      "================================"
    );

  } finally {
    try {
      if (
        databaseConnected &&
        accountCreated
      ) {
        const db = getMainDB();

        const user = await db
          .collection("users")
          .findOne({
            email: account.email,
          });

        if (user) {
          // Remove only proposals created by
          // this exact synthetic test account.

          await db
            .collection("locality_proposals")
            .deleteMany({
              requestedBy: user._id,
            });

          await db
            .collection("sessions")
            .deleteMany({
              userId: user._id,
            });

          console.log(
            "[CLEANUP] Synthetic proposals removed and test sessions revoked"
          );
        }
      }

    } finally {
      await closeDatabases();
    }
  }
}

run().catch((error) => {
  console.error(
    `[FAILED] Completed groups: ${passed}/8`
  );

  console.error(error.message);

  process.exitCode = 1;
});