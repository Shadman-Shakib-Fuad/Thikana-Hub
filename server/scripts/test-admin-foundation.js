import assert from "node:assert/strict";

import { randomBytes } from "node:crypto";

import { spawnSync } from "node:child_process";

import { env } from "../src/config/env.js";

const API =
  "http://127.0.0.1:5000/api/v1";

const ORIGIN =
  "http://localhost:3000";

const ACCESS =
  "/p14/admin/access";

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

// =====================================
// TRUSTED DEVELOPMENT CLI
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
// API REQUEST HELPER
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

  console.log("[API REQUEST]", method, endpoint);

  let response;
  let data;

  try {
    response = await fetch(API + endpoint, {
      method,
      headers,

      body:
        body !== undefined
          ? JSON.stringify(body)
          : undefined,

      signal: AbortSignal.timeout(45000),

      redirect: "error",
    });

    data = await response.json();

  } catch (error) {
    console.error(
      "[HTTP CONNECTION FAILED]",
      method,
      endpoint
    );

    console.error("[ERROR NAME]", error.name);

    console.error("[ERROR MESSAGE]", error.message);

    console.error(
      "[CAUSE CODE]",
      error.cause?.code ?? "Unavailable"
    );

    console.error(
      "[CAUSE MESSAGE]",
      error.cause?.message ?? "Unavailable"
    );

    console.error(
      "[HTTP STATUS]",
      response?.status ?? "No response received"
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
    response,

    data,
  };
}

// =====================================
// TEST GROUP
// =====================================

async function group(title, action) {
  await action();

  passed++;

  console.log(
    `\n[PASS ${passed}/6] ${title}\n`
  );
}

// =====================================
// REAL LOGIN API
// =====================================

async function login(role, expectedRole) {
  const { response, data } =
    await api("/auth/login", {
      method: "POST",

      body: accounts[role],
    });

  assert.equal(
    data.user.role,

    expectedRole
  );

  const cookies =
    response.headers.getSetCookie();

  const session = cookies.find(
    value =>
      value.startsWith(
        "thikanahub_session="
      )
  );

  assert.ok(
    session,

    "Session cookie missing."
  );

  assert.match(
    session,

    /;\s*HttpOnly(?:;|$)/i
  );

  return {
    cookie: session.split(";")[0],

    userId: data.user.id,
  };
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

  assert.equal(
    env.CLIENT_URL,

    ORIGIN,

    "Local development origin required."
  );

  console.log(
    "TEST FIXTURE MARKER:",

    marker
  );

  const sessions = {};

  try {
    // =================================
    // GROUP 01 — ANONYMOUS PROTECTION
    // =================================

    await group(
      "API availability and anonymous protection",

      async () => {
        await api("/health");

        const { response, data } =
          await api(ACCESS, {
            expected: 401,
          });

        assert.equal(
          data.code,

          "AUTH_REQUIRED"
        );

        assert.match(
          response.headers.get(
            "cache-control"
          ) ?? "",

          /no-store/i
        );
      }
    );

    // =================================
    // GROUP 02 — FIXTURE SETUP
    // =================================

    await group(
      "Secure fixture setup and real authentication",

      async () => {
        const passwords =
          Object.fromEntries(
            roles.map(role => [
              role,

              accounts[role].password,
            ])
          );

        fixtureStarted = true;

        cli(
          "scripts/create-data-manager-browser-fixtures.js",

          [marker],

          JSON.stringify(passwords)
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

        console.log(
          "[PASS] Backend reachable after fixture provisioning."
        );

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
      }
    );

    // =================================
    // GROUP 03 — ROLE ISOLATION
    // =================================

    await group(
      "Merchant, Reviewer and Data Manager isolation",

      async () => {
        for (const role of [
          "merchant",
          "reviewer",
          "manager",
        ]) {
          const { response } =
            await api(ACCESS, {
              cookie:
                sessions[role].cookie,

              expected: 403,
            });

          assert.match(
            response.headers.get(
              "cache-control"
            ) ?? "",

            /no-store/i
          );
        }
      }
    );

    // =================================
    // GROUP 04 — ADMIN RESPONSE
    // =================================

    await group(
      "Admin access and safe response structure",

      async () => {
        const { response, data } =
          await api(ACCESS, {
            cookie:
              sessions.admin.cookie,
          });

        assert.equal(
          data.administrator.userId,

          sessions.admin.userId
        );

        assert.equal(
          data.administrator.role,

          "admin"
        );

        assert.deepEqual(
          data.access,

          {
            adminPortal: true,
          }
        );

        assert.deepEqual(
          Object.keys(data).sort(),

          [
            "access",
            "administrator",
            "generatedAt",
            "success",
          ].sort()
        );

        assert.deepEqual(
          Object.keys(
            data.administrator
          ).sort(),

          ["role", "userId"]
        );

        assert.ok(
          Number.isFinite(
            Date.parse(data.generatedAt)
          )
        );

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
      }
    );

    // =================================
    // GROUP 05 — INPUT AND REGRESSION
    // =================================

    await group(
      "Parameter manipulation and existing Admin API compatibility",

      async () => {
        const { data } =
          await api(
            `${ACCESS}?role=merchant`,

            {
              cookie:
                sessions.admin.cookie,

              expected: 400,
            }
          );

        assert.equal(
          data.code,

          "INVALID_QUERY"
        );

        await api(
          "/auth/admin-check",

          {
            cookie:
              sessions.admin.cookie,
          }
        );

        await api(
          "/p14/admin/dataset-proposals/locality",

          {
            cookie:
              sessions.admin.cookie,
          }
        );

        await api(
          "/p14/admin/dataset-proposals/locality",

          {
            cookie:
              sessions.merchant.cookie,

            expected: 403,
          }
        );
      }
    );

    // =================================
    // GROUP 06 — SESSION REVOCATION
    // =================================

    await group(
      "Admin logout and revoked session protection",

      async () => {
        await api(
          "/auth/logout",

          {
            method: "POST",

            cookie:
              sessions.admin.cookie,
          }
        );

        await api(ACCESS, {
          cookie:
            sessions.admin.cookie,

          expected: 401,
        });

        await api(
          "/p14/admin/dataset-proposals/locality",

          {
            cookie:
              sessions.admin.cookie,

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

          marker
        );

        console.error(
          error.message
        );

        process.exitCode = 1;
      }
    }
  }

  assert.equal(
    passed,

    6
  );

  assert.ok(
    !process.exitCode,

    "Fixture cleanup failed."
  );

  console.log(
    "\n================================"
  );

  console.log(
    "FINAL ADMIN FOUNDATION RESULT"
  );

  console.log(
    "Total Test Groups: 6"
  );

  console.log(
    "Passed:",

    passed
  );

  console.log(
    "Failed: 0"
  );

  console.log(
    "ALL 6 ADMIN FOUNDATION TEST GROUPS PASSED"
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
    error.stack ?? error.message
  );

  process.exitCode = 1;
});
