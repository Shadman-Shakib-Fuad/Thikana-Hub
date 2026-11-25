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
const ORIGIN = "http://localhost:3000";

const marker = randomBytes(8).toString("hex");

const createdEmails = new Set();

let passed = 0;
let dbConnected = false;

// =====================================
// TEST ACCOUNT GENERATOR
// =====================================

function createAccount(label) {
  return {
    name: `Data Manager Test ${label}`,
    email: `dm-test-${label.toLowerCase()}-${marker}@example.com`,
    password: randomBytes(24).toString("hex"),
  };
}

const eligibleAccount = createAccount("Eligible");
const protectedMerchant = createAccount("Protected");

// =====================================
// API REQUEST HELPER
// =====================================

async function api(
  endpoint,
  {
    method = "GET",
    body,
    cookie,
    expected = 200,
  } = {}
) {
  const response = await fetch(`${API}${endpoint}`, {
    method,

    headers: {
      Accept: "application/json",
      Origin: ORIGIN,

      ...(body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),

      ...(cookie
        ? { Cookie: cookie }
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
// REGISTRATION
// =====================================

async function register(account) {
  await api("/auth/register", {
    method: "POST",
    expected: 201,
    body: account,
  });

  createdEmails.add(account.email);
}

// =====================================
// LOGIN
// =====================================

async function login(account) {
  const { response } = await api("/auth/login", {
    method: "POST",

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

  assert.ok(match, "Session cookie missing");

  return match[1];
}

// =====================================
// TEST GROUP HELPER
// =====================================

async function group(title, action) {
  await action();

  passed++;

  console.log(
    `\n[PASS ${passed}/8] ${title}\n`
  );
}

// =====================================
// MAIN SECURITY TEST
// =====================================

async function run() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "Run this test only in development."
    );
  }

  let merchantCookie;
  let protectedCookie;
  let managerCookie;
  let managerId;

  console.log("\n================================");
  console.log("DATA MANAGER AUTHORIZATION TEST");
  console.log("================================\n");

  try {
    await connectDatabases();

    dbConnected = true;

    const db = getMainDB();
    const users = db.collection("users");
    const sessions = db.collection("sessions");

    // =================================
    // GROUP 01
    // =================================

    await group(
      "Server health and provisioning validation",

      async () => {
        await api("/health");

        await assert.rejects(
          () => provisionDataManager("invalid-email"),
          { code: "INVALID_EMAIL" }
        );

        await assert.rejects(
          () => provisionDataManager(
            `missing-${marker}@example.com`
          ),
          { code: "ACCOUNT_NOT_ELIGIBLE" }
        );
      }
    );

    // =================================
    // GROUP 02
    // =================================

    await group(
      "Public privilege escalation prevention",

      async () => {
        await api("/auth/register", {
          method: "POST",
          expected: 400,

          body: {
            ...eligibleAccount,
            role: "data_manager",
          },
        });

        assert.equal(
          await users.findOne({
            email: eligibleAccount.email,
          }),
          null
        );

        await register(eligibleAccount);
        await register(protectedMerchant);

        const account = await users.findOne({
          email: eligibleAccount.email,
        });

        assert.ok(account);
        assert.equal(account.role, "merchant");

        managerId = account._id;

        merchantCookie = await login(eligibleAccount);
        protectedCookie = await login(protectedMerchant);

        await api("/p14/address-history", {
          cookie: merchantCookie,
        });
      }
    );

    // =================================
    // GROUP 03
    // =================================

    await group(
      "Existing merchant address protection",

      async () => {
        await api("/p14/address-resolutions", {
          method: "POST",
          expected: 201,
          cookie: protectedCookie,

          body: {
            address: `Synthetic ${marker}, Kazipara, Mirpur, Dhaka`,
          },
        });

        await assert.rejects(
          () => provisionDataManager(
            protectedMerchant.email
          ),
          { code: "ACCOUNT_HAS_ADDRESSES" }
        );

        const account = await users.findOne({
          email: protectedMerchant.email,
        });

        assert.equal(account.role, "merchant");

        await api("/p14/address-history", {
          cookie: protectedCookie,
        });
      }
    );

    // =================================
    // GROUP 04
    // =================================

    await group(
      "Data Manager provisioning and session revocation",

      async () => {
        const result = await provisionDataManager(
          eligibleAccount.email
        );

        assert.equal(result.success, true);
        assert.equal(result.role, "data_manager");

        const account = await users.findOne({
          _id: managerId,
        });

        assert.equal(account.role, "data_manager");

        assert.equal(
          await sessions.countDocuments({
            userId: managerId,
          }),
          0
        );

        await api("/p14/address-history", {
          cookie: merchantCookie,
          expected: 401,
        });
      }
    );

    // =================================
    // GROUP 05
    // =================================

    await group(
      "Repeated role provisioning prevention",

      async () => {
        await assert.rejects(
          () => provisionDataManager(
            eligibleAccount.email
          ),
          { code: "ACCOUNT_NOT_ELIGIBLE" }
        );

        const account = await users.findOne({
          _id: managerId,
        });

        assert.equal(account.role, "data_manager");
      }
    );

    // =================================
    // GROUP 06
    // =================================

    await group(
      "Data Manager cross-role API isolation",

      async () => {
        managerCookie = await login(eligibleAccount);

        for (const endpoint of [
          "/p14/address-history",
          "/p14/saved-addresses",
          "/p14/analytics",
          "/p14/reviewer/queue",
          "/p14/reviewer/statistics",
        ]) {
          await api(endpoint, {
            cookie: managerCookie,
            expected: 403,
          });
        }

        await api("/p14/address-resolutions", {
          method: "POST",
          cookie: managerCookie,
          expected: 403,

          body: {
            address: "Synthetic unauthorized merchant action",
          },
        });
      }
    );

    // =================================
    // GROUP 07
    // =================================

    await group(
      "Separate audit database verification",

      async () => {
        const audit = getAuditDB();

        const collections = await audit
          .listCollections({}, { nameOnly: true })
          .toArray();

        let found = false;

        for (const collection of collections) {
          if (collection.name.startsWith("system.")) {
            continue;
          }

          const event = await audit
            .collection(collection.name)
            .findOne({
              action: "DATA_MANAGER_PROVISION",

              targetId: {
                $in: [
                  managerId,
                  String(managerId),
                ],
              },

              result: "success",
            });

          if (event) {
            found = true;
            break;
          }
        }

        assert.equal(
          found,
          true,
          "Successful provisioning audit event missing"
        );
      }
    );

    // =================================
    // GROUP 08
    // =================================

    await group(
      "Logout and revoked session protection",

      async () => {
        await api("/auth/logout", {
          method: "POST",
          cookie: managerCookie,
        });

        await api("/p14/reviewer/statistics", {
          cookie: managerCookie,
          expected: 401,
        });

        await api("/auth/logout", {
          method: "POST",
          cookie: protectedCookie,
        });

        await api("/p14/address-history", {
          cookie: protectedCookie,
          expected: 401,
        });
      }
    );

    console.log("\n================================");
    console.log("FINAL DATA MANAGER AUTH RESULT");
    console.log("Total Test Groups: 8");
    console.log("Passed:", passed);
    console.log("Failed: 0");
    console.log("ALL 8 DATA MANAGER AUTH TEST GROUPS PASSED");
    console.log("================================\n");

  } finally {
    try {
      if (dbConnected && createdEmails.size > 0) {
        const db = getMainDB();

        const accounts = await db
          .collection("users")
          .find(
            {
              email: {
                $in: [...createdEmails],
              },
            },
            {
              projection: { _id: 1 },
            }
          )
          .toArray();

        await db.collection("sessions").deleteMany({
          userId: {
            $in: accounts.map(
              (account) => account._id
            ),
          },
        });

        console.log(
          "[CLEANUP] Test account sessions revoked"
        );
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