import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

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
// CONFIGURATION
// =====================================

const API = "http://127.0.0.1:5000/api/v1";
const BASE = "/p14/data-manager";
const PROPOSALS = `${BASE}/term-proposals`;

const COLLECTION = "locality_term_proposals";

const marker = randomBytes(8).toString("hex");

const account = {
  name: "Data Manager Term Test",
  email: `dm-term-${marker}@example.com`,
  password: randomBytes(24).toString("hex"),
};

let cookie = null;
let managerId = null;
let accountCreated = false;
let connected = false;
let passed = 0;

// =====================================
// HELPERS
// =====================================

async function api(
  endpoint,
  {
    method = "GET",
    body,
    session = cookie,
    origin = "http://localhost:3000",
    expected = 200,
  } = {}
) {
  const response = await fetch(API + endpoint, {
    method,

    headers: {
      Accept: "application/json",
      Origin: origin,

      ...(session
        ? { Cookie: session }
        : {}),

      ...(body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
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

    `${endpoint}: Expected ${allowed.join("/")} but received ${response.status}. ${result.code ?? ""}`
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

async function login() {
  const { response } = await api("/auth/login", {
    method: "POST",
    session: null,

    body: {
      email: account.email,
      password: account.password,
    },
  });

  const rawCookie =
    response.headers.get("set-cookie") ?? "";

  const match = rawCookie.match(
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

function normalize(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[০-৯]/g, digit =>
      String("০১২৩৪৫৬৭৮৯".indexOf(digit))
    )
    .replace(/\p{Cf}/gu, "")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function supports(record, field) {
  return (
    Array.isArray(record[field]) &&
    record[field].every(item => typeof item === "string")
  );
}

function termsEndpoint(id) {
  return `${BASE}/localities/${encodeURIComponent(id)}/terms`;
}

function submit(body, expected = 201, options = {}) {
  return api(PROPOSALS, {
    method: "POST",
    body,
    expected,
    ...options,
  });
}

// =====================================
// MAIN TEST
// =====================================

async function run() {
  assert.equal(
    process.env.NODE_ENV,
    "development",
    "Run only in development."
  );

  console.log("\nLANDMARK AND ALIAS INTEGRATION TEST\n");

  try {
    await connectDatabases();

    connected = true;

    const db = getMainDB();

    const localities = db.collection("localities");
    const proposals = db.collection(COLLECTION);

    const records = (
      await localities.find({ approved: true }).toArray()
    ).filter(
      item =>
        typeof item.id === "string" &&
        /^[A-Z0-9-]{4,128}$/.test(item.id)
    );

    const aliasLocality = records.find(
      item => supports(item, "aliases")
    );

    const landmarkLocality = records.find(
      item => supports(item, "landmarks")
    );

    assert.ok(
      aliasLocality,
      "No compatible aliases array found."
    );

    assert.ok(
      landmarkLocality,
      "No compatible landmarks array found."
    );

    // Select an existing term for removal testing.

    let removal = null;

    for (const locality of records) {
      for (const field of [
        "aliases",
        "areaAliases",
        "districtAliases",
        "landmarks",
      ]) {
        if (!supports(locality, field)) {
          continue;
        }

        for (const term of locality[field]) {
          const normalized = normalize(term);

          if (
            term.length > 120 ||
            !/[\p{L}\p{N}]/u.test(normalized) ||
            /[\p{Cc}]/u.test(term) ||
            locality[field].filter(
              item => normalize(item) === normalized
            ).length !== 1
          ) {
            continue;
          }

          const pending = await proposals.findOne({
            localityId: locality.id,
            field,
            normalizedTerm: normalized,
            status: "pending",
          });

          if (!pending) {
            removal = { locality, field, term };
            break;
          }
        }

        if (removal) break;
      }

      if (removal) break;
    }

    assert.ok(
      removal,
      "No available existing term for removal testing."
    );

    const snapshots = new Map();

    for (const item of [
      aliasLocality,
      landmarkLocality,
      removal.locality,
    ]) {
      snapshots.set(item.id, item);
    }

    const aliasInput = {
      localityId: aliasLocality.id,
      field: "aliases",
      operation: "add",
      term: `Synthetic Alias ${marker} 10`,
      reason: "Automated alias integration test.",
      evidence: "Synthetic test only. Do not approve.",
    };

    const landmarkInput = {
      ...aliasInput,
      localityId: landmarkLocality.id,
      field: "landmarks",
      term: `Synthetic Landmark ${marker}`,
    };

    // =================================
    // GROUP 01 — AUTHORIZATION
    // =================================

    await group(
      "Authentication and role protection",

      async () => {
        await api("/health");

        await api(PROPOSALS, {
          session: null,
          expected: 401,
        });

        await api("/auth/register", {
          method: "POST",
          session: null,
          expected: 201,
          body: account,
        });

        accountCreated = true;

        cookie = await login();

        await api(PROPOSALS, {
          expected: 403,
        });

        await submit(aliasInput, 403);

        const provisioned =
          await provisionDataManager(account.email);

        assert.equal(
          provisioned.role,
          "data_manager"
        );

        await api(PROPOSALS, {
          expected: 401,
        });

        cookie = await login();

        const user = await db
          .collection("users")
          .findOne({ email: account.email });

        assert.ok(user);

        managerId = user._id;
      }
    );

    // =================================
    // GROUP 02 — EXISTING DATA
    // =================================

    await group(
      "Locality alias and landmark listing",

      async () => {
        for (const [locality, field] of [
          [aliasLocality, "aliases"],
          [landmarkLocality, "landmarks"],
        ]) {
          const { result } = await api(
            termsEndpoint(locality.id)
          );

          const entry = result.fields.find(
            item => item.field === field
          );

          assert.ok(entry);
          assert.equal(entry.supported, true);

          assert.deepEqual(
            entry.items,
            locality[field]
          );
        }

        await api(
          termsEndpoint(`BD-TEST-${marker.toUpperCase()}`),
          { expected: 404 }
        );
      }
    );

    // =================================
    // GROUP 03 — VALIDATION
    // =================================

    await group(
      "Input validation and origin protection",

      async () => {
        for (const invalid of [
          { ...aliasInput, status: "approved" },
          { ...aliasInput, approved: true },
          { ...aliasInput, field: "approved" },
          { ...aliasInput, operation: "publish" },
          { ...aliasInput, term: "   " },
          { ...aliasInput, term: "!!!" },
          { ...aliasInput, term: "a".repeat(121) },
        ]) {
          await submit(invalid, 400);
        }

        await submit(aliasInput, 403, {
          origin: "https://untrusted.example.com",
        });
      }
    );

    // =================================
    // GROUP 04 — ALIAS DUPLICATES
    // =================================

    await group(
      "Alias proposal and bilingual duplicate protection",

      async () => {
        const created = await submit(aliasInput);

        assert.equal(
          created.result.item.status,
          "pending"
        );

        const duplicate = await submit({
          ...aliasInput,

          term: `SYNTHETIC ALIAS ${marker} ১০`,
        }, 409);

        assert.equal(
          duplicate.result.code,
          "PENDING_TERM_PROPOSAL_EXISTS"
        );

        const existing = await submit({
          ...aliasInput,
          localityId: removal.locality.id,
          field: removal.field,
          term: removal.term,
        }, 409);

        assert.equal(
          existing.result.code,
          "TERM_ALREADY_EXISTS"
        );
      }
    );

    // =================================
    // GROUP 05 — CONCURRENT REQUESTS
    // =================================

    await group(
      "Landmark proposal and concurrent duplicate protection",

      async () => {
        const settled = await Promise.allSettled([
          submit(landmarkInput, [201, 409]),
          submit(landmarkInput, [201, 409]),
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
          [201, 409]
        );

        const rejected = results.find(
          item => item.status === 409
        );

        assert.equal(
          rejected.result.code,
          "PENDING_TERM_PROPOSAL_EXISTS"
        );

        assert.equal(
          await proposals.countDocuments({
            requestedBy: managerId,
            field: "landmarks",
            operation: "add",
          }),
          1
        );
      }
    );

    // =================================
    // GROUP 06 — DATASET PROTECTION
    // =================================

    await group(
      "Term removal and live dataset protection",

      async () => {
        const removed = await submit({
          ...aliasInput,
          localityId: removal.locality.id,
          field: removal.field,
          operation: "remove",
          term: removal.term,
        });

        assert.equal(
          removed.result.item.status,
          "pending"
        );

        const missing = await submit({
          ...aliasInput,
          operation: "remove",
          term: `Unknown term ${marker}`,
        }, 404);

        assert.equal(
          missing.result.code,
          "TERM_NOT_FOUND"
        );

        for (const [id, before] of snapshots) {
          const after = await localities.findOne({ id });

          assert.deepEqual(
            after,
            before,
            "Approved dataset was unexpectedly modified."
          );
        }
      }
    );

    // =================================
    // GROUP 07 — PROPOSAL HISTORY
    // =================================

    await group(
      "Proposal history and pagination",

      async () => {
        const all = await api(
          `${PROPOSALS}?status=pending&limit=20`
        );

        assert.equal(all.result.items.length, 3);

        assert.ok(
          all.result.items.every(
            item => item.status === "pending"
          )
        );

        const first = await api(
          `${PROPOSALS}?limit=1`
        );

        assert.equal(first.result.items.length, 1);

        assert.equal(
          first.result.pagination.hasMore,
          true
        );

        const second = await api(
          `${PROPOSALS}?limit=1&cursor=${first.result.pagination.nextCursor}`
        );

        assert.equal(second.result.items.length, 1);

        assert.notEqual(
          first.result.items[0].proposalId,
          second.result.items[0].proposalId
        );

        await api(`${PROPOSALS}?limit=51`, {
          expected: 400,
        });

        const approved = await api(
          `${PROPOSALS}?status=approved`
        );

        assert.equal(
          approved.result.items.length,
          0
        );
      }
    );

    // =================================
    // GROUP 08 — AUDIT & LOGOUT
    // =================================

    await group(
      "Audit logging and session protection",

      async () => {
        const stored = await proposals.find({
          requestedBy: managerId,
        }).toArray();

        assert.equal(stored.length, 3);

        const audit = getAuditDB();

        const collections = await audit
          .listCollections({}, { nameOnly: true })
          .toArray();

        for (const proposal of stored) {
          let found = false;

          for (const collection of collections) {
            if (collection.name.startsWith("system.")) {
              continue;
            }

            const event = await audit
              .collection(collection.name)
              .findOne({
                action: "LOCALITY_TERM_PROPOSAL_CREATE",
                result: "success",

                targetId: {
                  $in: [
                    proposal._id,
                    String(proposal._id),
                  ],
                },
              });

            if (event) {
              found = true;
              break;
            }
          }

          assert.ok(
            found,
            "Successful proposal audit event missing."
          );
        }

        await api("/auth/logout", {
          method: "POST",
        });

        await api(PROPOSALS, {
          expected: 401,
        });
      }
    );

  } finally {
    try {
      if (connected && accountCreated) {
        const db = getMainDB();

        const user = await db
          .collection("users")
          .findOne({ email: account.email });

        if (user) {
          await db.collection(COLLECTION).deleteMany({
            requestedBy: user._id,
            status: "pending",
          });

          await db.collection("sessions").deleteMany({
            userId: user._id,
          });

          console.log(
            "[CLEANUP] Synthetic pending proposals removed and sessions revoked"
          );
        }
      }
    } finally {
      await closeDatabases();
    }
  }

  console.log("\n================================");
  console.log("FINAL LANDMARK AND ALIAS RESULT");
  console.log("Total Test Groups: 8");
  console.log("Passed:", passed);
  console.log("Failed: 0");
  console.log("ALL 8 TERM TEST GROUPS PASSED");
  console.log("================================\n");
}

run().catch(error => {
  console.error(
    `[FAILED] Completed groups: ${passed}/8`
  );

  console.error(error.stack ?? error.message);

  process.exitCode = 1;
});