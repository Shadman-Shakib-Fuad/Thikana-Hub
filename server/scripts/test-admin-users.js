import assert from "node:assert/strict";

import {
  randomBytes,
} from "node:crypto";

import {
  spawnSync,
} from "node:child_process";

import {
  env,
} from "../src/config/env.js";

const API =
  "http://127.0.0.1:5000/api/v1";

const ORIGIN =
  "http://localhost:3000";

const BASE =
  "/p14/admin/users";

const marker =
  randomBytes(8).toString("hex");

const roles = [
  "merchant",
  "reviewer",
  "manager",
  "admin",
];

const expectedRoles = {
  merchant: "merchant",
  reviewer: "reviewer",
  manager: "data_manager",
  admin: "admin",
};

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

const sessions = {};

let passed = 0;

let fixtureStarted = false;

// =====================================
// DEVELOPMENT CLI
// =====================================

function cli(script, args = [], input) {
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
    console.log(result.stdout.trim());
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
// API HELPER
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
          body === undefined
            ? undefined
            : JSON.stringify(body),

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
      error.cause?.code ?? "Unavailable"
    );

    throw error;
  }

  console.log(
    `[API] ${method} ${endpoint} -> ${response.status}`
  );

  assert.equal(
    response.status,
    expected,
    `${endpoint}: ${data.code ?? ""} ${data.message ?? ""}`
  );

  assert.equal(
    data.success,
    expected >= 200 &&
    expected < 300
  );

  if (endpoint.startsWith(BASE)) {
    assert.match(
      response.headers.get(
        "cache-control"
      ) ?? "",
      /no-store/i
    );
  }

  return {
    data,
    response,
  };
}

// =====================================
// LOGIN
// =====================================

async function login(role) {
  const {
    data,
    response,
  } = await api(
    "/auth/login",
    {
      method: "POST",

      body: accounts[role],
    }
  );

  assert.equal(
    data.user.role,
    expectedRoles[role]
  );

  const cookie =
    response.headers
      .getSetCookie()
      .find(value =>
        value.startsWith(
          "thikanahub_session="
        )
      );

  assert.ok(cookie);

  assert.match(
    cookie,
    /;\s*HttpOnly(?:;|$)/i
  );

  assert.match(
    data.user.id,
    /^[a-f0-9]{24}$/i
  );

  return {
    cookie:
      cookie.split(";")[0],

    userId:
      data.user.id,
  };
}

// =====================================
// ASSERTION HELPERS
// =====================================

async function group(title, action) {
  await action();

  passed++;

  console.log(
    `\n[PASS ${passed}/6] ${title}\n`
  );
}

function safeUser(item) {
  assert.deepEqual(
    Object.keys(item).sort(),

    [
      "userId",
      "name",
      "email",
      "role",
      "status",
      "createdAt",
      "updatedAt",
      "lastLoginAt",
    ].sort()
  );

  assert.match(
    item.userId,
    /^[a-f0-9]{24}$/i
  );

  assert.equal(
    typeof item.name,
    "string"
  );

  assert.equal(
    typeof item.email,
    "string"
  );

  for (const key of [
    "createdAt",
    "updatedAt",
    "lastLoginAt",
  ]) {
    assert.ok(
      item[key] === null ||

      (
        typeof item[key] === "string" &&
        Number.isFinite(
          Date.parse(item[key])
        )
      )
    );
  }
}

function adminCookie() {
  return sessions.admin.cookie;
}

async function eligibility(role) {
  const { data } = await api(
    `${BASE}/${sessions[role].userId}/role-eligibility`,

    {
      cookie: adminCookie(),
    }
  );

  assert.equal(
    data.eligibility.userId,
    sessions[role].userId
  );

  return data.eligibility;
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

  try {
    // =================================
    // GROUP 01 — AUTHORIZATION
    // =================================

    await group(
      "Authentication and role isolation",

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

        for (const role of roles) {
          sessions[role] =
            await login(role);
        }

        for (const role of [
          "merchant",
          "reviewer",
          "manager",
        ]) {
          await api(BASE, {
            cookie:
              sessions[role].cookie,

            expected: 403,
          });

          await api(
            `${BASE}/${sessions.admin.userId}`,
            {
              cookie:
                sessions[role].cookie,

              expected: 403,
            }
          );

          await api(
            `${BASE}/${sessions.merchant.userId}/role-eligibility`,
            {
              cookie:
                sessions[role].cookie,

              expected: 403,
            }
          );
        }
      }
    );

    // =================================
    // GROUP 02 — SEARCH & FILTER
    // =================================

    await group(
      "User search and role/status filtering",

      async () => {
        const { data } = await api(
          `${BASE}?q=${marker}&limit=10`,

          {
            cookie: adminCookie(),
          }
        );

        assert.equal(
          data.items.length,
          4
        );

        for (const role of roles) {
          const item =
            data.items.find(
              user =>
                user.userId ===
                sessions[role].userId
            );

          assert.ok(item);

          safeUser(item);

          assert.equal(
            item.email,
            accounts[role].email
          );

          assert.equal(
            item.role,
            expectedRoles[role]
          );

          assert.equal(
            item.status,
            "active"
          );
        }

        for (const role of roles) {
          const filtered =
            await api(
              `${BASE}?q=${marker}&role=${expectedRoles[role]}&status=active`,

              {
                cookie: adminCookie(),
              }
            );

          assert.equal(
            filtered.data.items.length,
            1
          );

          assert.equal(
            filtered.data.items[0].userId,
            sessions[role].userId
          );
        }

        const suspended =
          await api(
            `${BASE}?q=${marker}&status=suspended`,
            {
              cookie: adminCookie(),
            }
          );

        assert.equal(
          suspended.data.items.length,
          0
        );
      }
    );

    // =================================
    // GROUP 03 — PAGINATION
    // =================================

    await group(
      "Secure cursor pagination and search protection",

      async () => {
        const first =
          await api(
            `${BASE}?q=${marker}&limit=2`,

            {
              cookie: adminCookie(),
            }
          );

        assert.equal(
          first.data.items.length,
          2
        );

        assert.equal(
          first.data.pagination.hasMore,
          true
        );

        const cursor =
          first.data.pagination.nextCursor;

        assert.match(
          cursor,
          /^[a-f0-9]{24}$/i
        );

        const second =
          await api(
            `${BASE}?q=${marker}&limit=2&cursor=${cursor}`,

            {
              cookie: adminCookie(),
            }
          );

        assert.equal(
          second.data.items.length,
          2
        );

        assert.equal(
          second.data.pagination.hasMore,
          false
        );

        assert.equal(
          second.data.pagination.nextCursor,
          null
        );

        const ids = [
          ...first.data.items,
          ...second.data.items,
        ].map(user => user.userId);

        assert.equal(
          new Set(ids).size,
          4
        );

        assert.deepEqual(
          [...ids].sort(),

          roles.map(
            role => sessions[role].userId
          ).sort()
        );

        const escaped =
          await api(
            `${BASE}?q=${encodeURIComponent(marker + ".*")}`,

            {
              cookie: adminCookie(),
            }
          );

        assert.equal(
          escaped.data.items.length,
          0
        );
      }
    );

    // =================================
    // GROUP 04 — DETAILS & VALIDATION
    // =================================

    await group(
      "User details, strict validation and private field protection",

      async () => {
        for (const role of roles) {
          const { data } = await api(
            `${BASE}/${sessions[role].userId}`,

            {
              cookie: adminCookie(),
            }
          );

          safeUser(data.item);

          assert.equal(
            data.item.email,
            accounts[role].email
          );

          assert.equal(
            data.item.role,
            expectedRoles[role]
          );
        }

        for (const query of [
          "limit=0",
          "limit=51",
          "limit=1.5",
          "role=superadmin",
          "status=unknown",
          "cursor=invalid",
          "unexpected=true",
          "role=merchant&role=admin",
          "q%5B%24ne%5D=x",
          "q=" + "a".repeat(81),
        ]) {
          await api(
            `${BASE}?${query}`,
            {
              cookie: adminCookie(),

              expected: 400,
            }
          );
        }

        await api(
          `${BASE}/invalid-id`,

          {
            cookie: adminCookie(),

            expected: 400,
          }
        );

        await api(
          `${BASE}/${sessions.merchant.userId}?unexpected=true`,

          {
            cookie: adminCookie(),

            expected: 400,
          }
        );

        const unknownId =
          randomBytes(12).toString("hex");

        await api(
          `${BASE}/${unknownId}`,

          {
            cookie: adminCookie(),

            expected: 404,
          }
        );

        await api(
          `${BASE}/${unknownId}/role-eligibility`,

          {
            cookie: adminCookie(),

            expected: 404,
          }
        );
      }
    );

    // =================================
    // GROUP 05 — ELIGIBILITY
    // =================================

    await group(
      "Role eligibility and self-role protection",

      async () => {
        const merchant =
          await eligibility("merchant");

        assert.equal(
          merchant.eligible,
          true
        );

        assert.deepEqual(
          merchant.allowedRoles,
          [
            "reviewer",
            "data_manager",
          ]
        );

        assert.equal(
          merchant.reasonCode,
          null
        );

        const admin =
          await eligibility("admin");

        assert.equal(
          admin.eligible,
          false
        );

        assert.deepEqual(
          admin.allowedRoles,
          []
        );

        assert.equal(
          admin.reasonCode,
          "SELF_ROLE_CHANGE_FORBIDDEN"
        );

        for (const role of [
          "reviewer",
          "manager",
        ]) {
          const item =
            await eligibility(role);

          assert.equal(
            item.eligible,
            false
          );

          assert.deepEqual(
            item.allowedRoles,
            []
          );

          assert.equal(
            item.reasonCode,
            "ACCOUNT_NOT_MERCHANT"
          );
        }
      }
    );

    // =================================
    // GROUP 06 — OWNERSHIP & LOGOUT
    // =================================

    await group(
      "Address ownership protection and revoked sessions",

      async () => {
        const created =
          await api(
            "/p14/address-resolutions",

            {
              method: "POST",

              cookie:
                sessions.merchant.cookie,

              expected: 201,

              body: {
                address:
                  `House 12, Kazipara, Mirpur, Dhaka ${marker}`,
              },
            }
          );

        assert.ok(
          created.data.jobId
        );

        const merchant =
          await eligibility("merchant");

        assert.equal(
          merchant.eligible,
          false
        );

        assert.deepEqual(
          merchant.allowedRoles,
          []
        );

        assert.equal(
          merchant.reasonCode,
          "ACCOUNT_HAS_ADDRESS_RECORDS"
        );

        console.log(
          "[PASS] Existing address ownership protected."
        );

        // Existing Admin API regression checks.

        await api(
          "/p14/admin/access",
          {
            cookie: adminCookie(),
          }
        );

        await api(
          "/p14/admin/statistics",
          {
            cookie: adminCookie(),
          }
        );

        await api(
          "/p14/admin/dataset-proposals/locality",
          {
            cookie: adminCookie(),
          }
        );

        await api(
          "/auth/logout",
          {
            method: "POST",

            cookie: adminCookie(),
          }
        );

        await api(BASE, {
          cookie: adminCookie(),

          expected: 401,
        });

        await api(
          `${BASE}/${sessions.merchant.userId}`,
          {
            cookie: adminCookie(),

            expected: 401,
          }
        );

        await api(
          `${BASE}/${sessions.merchant.userId}/role-eligibility`,
          {
            cookie: adminCookie(),

            expected: 401,
          }
        );
      }
    );

  } finally {
    if (fixtureStarted) {
      try {
        cli(
          "scripts/cleanup-data-manager-browser.js",
          [marker]
        );

      } catch (error) {
        console.error(
          "[CLEANUP FAILED]",
          marker,
          error.message
        );

        process.exitCode = 1;
      }
    }
  }

  assert.equal(passed, 6);

  assert.ok(
    !process.exitCode,
    "Fixture cleanup failed."
  );

  console.log("\n================================");
  console.log("FINAL ADMIN USER MANAGEMENT RESULT");
  console.log("Total Test Groups: 6");
  console.log("Passed:", passed);
  console.log("Failed: 0");
  console.log("ALL 6 ADMIN USER MANAGEMENT TEST GROUPS PASSED");
  console.log("================================\n");
}

run().catch(error => {
  console.error(
    `[FAILED] Completed groups: ${passed}/6`
  );

  console.error(
    error.stack ?? error.message
  );

  process.exitCode = 1;
});
