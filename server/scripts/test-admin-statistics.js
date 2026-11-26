import assert from "node:assert/strict";

import { randomBytes } from "node:crypto";

import { spawnSync } from "node:child_process";

import { env } from "../src/config/env.js";

import {
  connectDatabases,
  closeDatabases,
  getMainDB,
  getAuditDB,
} from "../src/config/database.js";

const API =
  "http://127.0.0.1:5000/api/v1";

const ORIGIN =
  "http://localhost:3000";

const BASE =
  "/p14/admin/statistics";

const marker =
  randomBytes(8).toString("hex");

const roles = [
  "merchant",
  "reviewer",
  "manager",
  "admin",
];

const accounts = Object.fromEntries(
  roles.map(role => [
    role,
    {
      email:
        `dm-browser-${role}-${marker}@example.com`,

      password:
        randomBytes(24).toString("hex"),
    },
  ])
);

let passed = 0;

let fixtureStarted = false;

let databaseStarted = false;

// =====================================
// DEVELOPMENT CLI
// =====================================

function cli(
  script,
  args = [],
  input
) {
  const result = spawnSync(
    process.execPath,

    [script, ...args],

    {
      cwd: process.cwd(),

      input,

      encoding: "utf8",

      timeout: 90000,

      windowsHide: true,

      maxBuffer: 1024 * 1024,

      env: {
        ...process.env,

        THIKANAHUB_BROWSER_FIXTURES: "1",
      },
    }
  );

  if (result.stdout?.trim()) {
    console.log(
      result.stdout.trim()
    );
  }

  if (
    result.error ||
    result.status !== 0
  ) {
    throw new Error(
      `CLI failed: ${script} | ` +
      `${result.error?.code ?? result.status}`
    );
  }
}

// =====================================
// HTTP REQUEST
// =====================================

async function api(
  endpoint,

  {
    method = "GET",

    cookie,

    body,

    expected = 200,
  } = {}
) {
  const headers = {
    Accept: "application/json",

    Connection: "close",

    Origin: ORIGIN,
  };

  if (cookie) {
    headers.Cookie = cookie;
  }

  if (body !== undefined) {
    headers["Content-Type"] =
      "application/json";
  }

  console.log(
    "[API REQUEST]",
    method,
    endpoint
  );

  let response;
  let data;

  try {
    response = await fetch(
      API + endpoint,

      {
        method,

        headers,

        body:
          body !== undefined
            ? JSON.stringify(body)
            : undefined,

        signal:
          AbortSignal.timeout(45000),

        redirect: "error",
      }
    );

    data = await response.json();

  } catch (error) {
    console.error(
      "[HTTP ERROR]",
      method,
      endpoint,
      error.name,
      error.cause?.code ??
        "Unavailable"
    );

    throw error;
  }

  console.log(
    `[API] ${method} ${endpoint} -> ${response.status}`
  );

  assert.equal(
    response.status,
    expected,

    `${endpoint}: ${data.code ?? ""} ` +
    `${data.message ?? ""}`
  );

  assert.equal(
    data.success,
    expected >= 200 &&
    expected < 300
  );

  return {
    data,
    response,
  };
}

// =====================================
// REAL LOGIN
// =====================================

async function login(
  role,
  expectedRole
) {
  const {
    response,
    data,
  } = await api(
    "/auth/login",

    {
      method: "POST",

      body: accounts[role],
    }
  );

  assert.equal(
    data.user.role,
    expectedRole
  );

  const cookie =
    response.headers
      .getSetCookie()
      .find(value =>
        value.startsWith(
          "thikanahub_session="
        )
      );

  assert.ok(
    cookie,
    "Session cookie missing."
  );

  assert.match(
    cookie,
    /;\s*HttpOnly(?:;|$)/i
  );

  return cookie.split(";")[0];
}

// =====================================
// TEST HELPERS
// =====================================

async function group(
  title,
  action
) {
  await action();

  passed++;

  console.log(
    `\n[PASS ${passed}/6] ${title}\n`
  );
}

function checkCounts(value) {
  assert.ok(
    Number.isSafeInteger(value) &&
    value >= 0,

    "Invalid aggregate count."
  );
}

function checkPartition(
  total,
  ...counts
) {
  checkCounts(total);

  for (const count of counts) {
    checkCounts(count);
  }

  assert.equal(
    counts.reduce(
      (sum, value) =>
        sum + value,
      0
    ),

    total
  );
}

function verifySafeKeys(
  value,
  allowedKeys
) {
  assert.deepEqual(
    Object.keys(value).sort(),

    allowedKeys.sort()
  );
}

async function count(
  collection,
  filter = {}
) {
  return getMainDB()
    .collection(collection)
    .countDocuments(
      filter,

      { maxTimeMS: 10000 }
    );
}

async function statistics(cookie) {
  const {
    data,
    response,
  } = await api(BASE, { cookie });

  assert.match(
    response.headers.get(
      "cache-control"
    ) ?? "",

    /no-store/i
  );

  assert.ok(
    response.headers.has(
      "ratelimit-limit"
    )
  );

  verifySafeKeys(
    data,

    ["success", "statistics"]
  );

  return data.statistics;
}

// =====================================
// MAIN TEST
// =====================================

async function run() {
  assert.equal(
    process.env.NODE_ENV,
    "development"
  );

  assert.equal(
    env.CLIENT_URL,
    ORIGIN
  );

  console.log(
    "TEST FIXTURE MARKER:",
    marker
  );

  const sessions = {};

  let overview;

  try {
    // =================================
    // GROUP 01 — AUTHORIZATION
    // =================================

    await group(
      "Authentication and Admin-only statistics access",

      async () => {
        await api("/health");

        await api(BASE, {
          expected: 401,
        });

        fixtureStarted = true;

        cli(
          "scripts/create-data-manager-browser-fixtures.js",

          [marker],

          JSON.stringify(
            Object.fromEntries(
              roles.map(role => [
                role,
                accounts[role].password,
              ])
            )
          )
        );

        cli(
          "scripts/reviewer-admin.js",

          [
            "provision",
            accounts.reviewer.email,
          ]
        );

        cli(
          "scripts/data-manager-admin.js",

          [
            "provision",
            accounts.manager.email,
          ]
        );

        cli(
          "scripts/admin-provision.js",

          [
            "provision",
            accounts.admin.email,
          ]
        );

        await api("/health");

        const expectedRoles = {
          merchant: "merchant",
          reviewer: "reviewer",
          manager: "data_manager",
          admin: "admin",
        };

        for (const role of roles) {
          sessions[role] =
            await login(
              role,
              expectedRoles[role]
            );
        }

        for (const role of [
          "merchant",
          "reviewer",
          "manager",
        ]) {
          await api(BASE, {
            cookie: sessions[role],

            expected: 403,
          });
        }

        await api(
          `${BASE}?role=merchant`,

          {
            cookie: sessions.admin,

            expected: 400,
          }
        );

        overview = await statistics(
          sessions.admin
        );

        databaseStarted = true;

        await connectDatabases();
      }
    );

    // =================================
    // GROUP 02 — USER STATISTICS
    // =================================

    await group(
      "Accurate user and role statistics",

      async () => {
        const users = overview.users;

        assert.equal(
          users.total,
          await count("users")
        );

        assert.equal(
          users.active,

          await count("users", {
            status: "active",
          })
        );

        assert.equal(
          users.suspended,

          await count("users", {
            status: "suspended",
          })
        );

        const roleMap = {
          merchant: "merchant",
          reviewer: "reviewer",
          dataManager: "data_manager",
          admin: "admin",
        };

        for (
          const [key, role]
          of Object.entries(roleMap)
        ) {
          assert.equal(
            users.byRole[key],

            await count("users", {
              role,
            })
          );
        }

        checkPartition(
          users.total,

          users.active,
          users.suspended,
          users.otherStatus
        );

        checkPartition(
          users.total,

          ...Object.values(
            users.byRole
          )
        );
      }
    );

    // =================================
    // GROUP 03 — ADDRESS STATISTICS
    // =================================

    await group(
      "Address, confirmation and review statistics",

      async () => {
        const addresses =
          overview.addresses;

        assert.equal(
          addresses.total,

          await count(
            "address_requests"
          )
        );

        assert.equal(
          addresses.confirmed,

          await count(
            "address_requests",

            { decision: "confirmed" }
          )
        );

        assert.equal(
          addresses.saved,

          await count(
            "address_requests",

            { saved: true }
          )
        );

        checkPartition(
          addresses.total,

          addresses.confirmed,

          addresses.unresolved
        );

        const expectedRate =
          addresses.total === 0
            ? 0
            : Number(
                (
                  addresses.confirmed /
                  addresses.total *
                  100
                ).toFixed(2)
              );

        assert.equal(
          addresses.confirmationRate,
          expectedRate
        );

        const reviews =
          addresses.reviews;

        assert.equal(
          reviews.totalRequested,

          await count(
            "address_requests",

            {
              decision:
                "review_requested",
            }
          )
        );

        for (
          const [key, status]
          of Object.entries({
            pending: "pending",

            escalated: "escalated",

            awaitingMerchantConfirmation:
              "resolved",
          })
        ) {
          assert.equal(
            reviews[key],

            await count(
              "address_requests",

              {
                decision:
                  "review_requested",

                "reviewAssignment.status":
                  status,
              }
            )
          );
        }

        assert.equal(
          reviews.awaitingAssignment,

          await count(
            "address_requests",

            {
              decision:
                "review_requested",

              "reviewAssignment.status": {
                $in: [
                  null,
                  "unassigned",
                ],
              },
            }
          )
        );

        checkPartition(
          reviews.totalRequested,

          reviews.awaitingAssignment,
          reviews.pending,
          reviews.escalated,
          reviews.awaitingMerchantConfirmation,
          reviews.other
        );
      }
    );

    // =================================
    // GROUP 04 — DATASET STATISTICS
    // =================================

    await group(
      "Locality and proposal database accuracy",

      async () => {
        const dataset =
          overview.dataset;

        assert.equal(
          dataset.localities.total,

          await count("localities")
        );

        assert.equal(
          dataset.localities.approved,

          await count(
            "localities",
            { approved: true }
          )
        );

        checkPartition(
          dataset.localities.total,

          dataset.localities.approved,

          dataset.localities.notApproved
        );

        const proposals =
          dataset.proposals;

        const types = {
          locality:
            "locality_proposals",

          term:
            "locality_term_proposals",
        };

        for (
          const [kind, collection]
          of Object.entries(types)
        ) {
          const item =
            proposals.byType[kind];

          assert.equal(
            item.total,

            await count(collection)
          );

          for (const status of [
            "pending",
            "approved",
            "rejected",
          ]) {
            assert.equal(
              item[status],

              await count(
                collection,
                { status }
              )
            );
          }

          checkPartition(
            item.total,

            item.pending,
            item.approved,
            item.rejected,
            item.other
          );
        }

        for (const key of [
          "total",
          "pending",
          "approved",
          "rejected",
          "other",
        ]) {
          assert.equal(
            proposals[key],

            proposals.byType.locality[key] +
            proposals.byType.term[key]
          );
        }
      }
    );

    // =================================
    // GROUP 05 — ACTIVITY & HEALTH
    // =================================

    await group(
      "Recent activity, database health and private-data protection",

      async () => {
        const activity =
          overview.activity;

        assert.equal(
          activity.periodDays,
          7
        );

        const from =
          new Date(activity.from);

        const to =
          new Date(activity.to);

        assert.equal(
          to.getTime() -
          from.getTime(),

          7 * 24 * 60 * 60 * 1000
        );

        const filter = {
          createdAt: {
            $gte: from,
            $lte: to,
          },
        };

        assert.equal(
          activity.newUsers,

          await count(
            "users",
            filter
          )
        );

        assert.equal(
          activity.newAddressRequests,

          await count(
            "address_requests",
            filter
          )
        );

        assert.equal(
          activity.newProposals,

          await count(
            "locality_proposals",
            filter
          ) +

          await count(
            "locality_term_proposals",
            filter
          )
        );

        assert.equal(
          (
            await getMainDB()
              .command({ ping: 1 })
          ).ok,

          1
        );

        assert.equal(
          (
            await getAuditDB()
              .command({ ping: 1 })
          ).ok,

          1
        );

        assert.deepEqual(
          overview.system,

          {
            status: "operational",

            databases: {
              main: "reachable",

              audit: "reachable",
            },
          }
        );

        verifySafeKeys(
          overview,

          [
            "users",
            "addresses",
            "dataset",
            "activity",
            "system",
            "generatedAt",
          ]
        );

        function validateSafeTree(value) {
          if (typeof value === "number") {
            assert.ok(
              Number.isFinite(value) &&
              value >= 0
            );

            return;
          }

          if (typeof value === "string") {
            assert.ok(
              [
                "operational",
                "degraded",
                "reachable",
                "unavailable",
              ].includes(value) ||

              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
                .test(value),

              "Unexpected string in statistics response."
            );

            return;
          }

          assert.ok(
            value &&
            typeof value === "object" &&
            !Array.isArray(value)
          );

          for (
            const [key, child]
            of Object.entries(value)
          ) {
            assert.ok(
              !/password|email|token|ciphertext|originalAddress|encryptedPayload|reviewerNote|investigationNote|secret|credential/i
                .test(key),

              `Sensitive field exposed: ${key}`
            );

            validateSafeTree(child);
          }
        }

        validateSafeTree(overview);

        console.log(
          "[PASS] Aggregate response privacy verified."
        );
      }
    );

    // =================================
    // GROUP 06 — LIVE UPDATE & LOGOUT
    // =================================

    await group(
      "Live statistics refresh and revoked session protection",

      async () => {
        const before =
          await statistics(
            sessions.admin
          );

        const { data: created } =
          await api(
            "/p14/address-resolutions",

            {
              method: "POST",

              cookie: sessions.merchant,

              expected: 201,

              body: {
                address:
                  `House 12, Kazipara, Mirpur, Dhaka ${marker}`,
              },
            }
          );

        assert.ok(
          created.jobId
        );

        const after =
          await statistics(
            sessions.admin
          );

        assert.equal(
          after.addresses.total,

          before.addresses.total + 1
        );

        assert.equal(
          after.addresses.unresolved,

          before.addresses.unresolved + 1
        );

        console.log(
          "[PASS] New address reflected in live statistics."
        );

        await api(
          "/p14/address-feedback",

          {
            method: "POST",

            cookie: sessions.merchant,

            body: {
              jobId: created.jobId,

              decision:
                "no_correct_match",

              revision: 0,
            },
          }
        );

        const reviewed =
          await statistics(
            sessions.admin
          );

        assert.equal(
          reviewed.addresses.reviews
            .totalRequested,

          after.addresses.reviews
            .totalRequested + 1
        );

        console.log(
          "[PASS] Manual review request reflected in statistics."
        );

        await api(
          "/auth/logout",

          {
            method: "POST",

            cookie: sessions.admin,
          }
        );

        await api(BASE, {
          cookie: sessions.admin,

          expected: 401,
        });

        await api(
          "/p14/admin/access",

          {
            cookie: sessions.admin,

            expected: 401,
          }
        );
      }
    );

  } finally {
    try {
      if (databaseStarted) {
        await closeDatabases();
      }
    } finally {
      if (fixtureStarted) {
        try {
          cli(
            "scripts/cleanup-data-manager-browser.js",

            [marker]
          );

        } catch {
          console.error(
            "[CLEANUP FAILED]",
            marker
          );

          process.exitCode = 1;
        }
      }
    }
  }

  assert.equal(passed, 6);

  assert.ok(
    !process.exitCode,

    "Fixture cleanup failed."
  );

  console.log(
    "\n================================"
  );

  console.log(
    "FINAL ADMIN STATISTICS RESULT"
  );

  console.log(
    "Total Test Groups: 6"
  );

  console.log(
    "Passed:", passed
  );

  console.log(
    "Failed: 0"
  );

  console.log(
    "ALL 6 ADMIN STATISTICS TEST GROUPS PASSED"
  );

  console.log(
    "================================\n"
  );
}

run().catch(error => {
  console.error(
    `[FAILED] Completed groups: ${passed}/6`
  );

  console.error(
    error.stack ??
    error.message
  );

  process.exitCode = 1;
});
