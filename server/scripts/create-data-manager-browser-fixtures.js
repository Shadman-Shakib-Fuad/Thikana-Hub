import assert from "node:assert/strict";
import fs from "node:fs";

import {
  connectDatabases,
  closeDatabases,
  getMainDB,
} from "../src/config/database.js";

import { env } from "../src/config/env.js";

import {
  hashPassword,
  verifyPassword,
} from "../src/utils/password.js";

const roles = [
  "merchant",
  "reviewer",
  "manager",
  "admin",
];

async function run() {
  // =====================================
  // DEVELOPMENT-ONLY SECURITY GUARDS
  // =====================================

  assert.equal(
    process.env.NODE_ENV,
    "development",
    "Development environment required."
  );

  assert.equal(
    env.CLIENT_URL,
    "http://localhost:3000",
    "Local development client required."
  );

  assert.equal(
    process.env.THIKANAHUB_BROWSER_FIXTURES,
    "1",
    "Explicit test fixture authorization required."
  );

  const marker = process.argv[2];

  assert.ok(
    typeof marker === "string" &&
    /^[a-f0-9]{16}$/.test(marker),
    "Invalid test fixture marker."
  );

  // Receive generated test passwords through stdin.
  // Passwords are never passed as command arguments.

  const rawInput = fs.readFileSync(0, "utf8");

  const passwords = JSON.parse(rawInput);

  assert.ok(
    passwords &&
    typeof passwords === "object" &&
    !Array.isArray(passwords),
    "Invalid fixture input."
  );

  assert.equal(
    Object.keys(passwords).length,
    roles.length,
    "Exactly four test passwords are required."
  );

  for (const role of roles) {
    assert.ok(
      typeof passwords[role] === "string" &&
      /^[a-f0-9]{48}$/.test(passwords[role]),
      "Invalid generated fixture password."
    );
  }

  try {
    await connectDatabases();

    const db = getMainDB();

    const users = db.collection("users");

    const emails = roles.map(
      role =>
        `dm-browser-${role}-${marker}@example.com`
    );

    // Never overwrite an existing account.

    const existing = await users.countDocuments({
      email: { $in: emails },
    });

    assert.equal(
      existing,
      0,
      "Fixture accounts already exist."
    );

    const documents = [];

    for (const role of roles) {
      const passwordHash =
        await hashPassword(passwords[role]);

      assert.ok(
        await verifyPassword(
          passwords[role],
          passwordHash
        ),
        "Password hashing verification failed."
      );

      const now = new Date();

      // Exact existing registration user schema.
      // All accounts start as merchants.

      documents.push({
        name: `DM Browser Test ${role}`,

        email:
          `dm-browser-${role}-${marker}@example.com`,

        passwordHash,

        role: "merchant",

        status: "active",

        createdAt: now,

        updatedAt: now,
      });
    }

    const result = await users.insertMany(
      documents,
      { ordered: true }
    );

    assert.equal(result.insertedCount, 4);

    console.log(
      "[PASS] Existing scrypt password hashing verified."
    );

    console.log(
      "[SUCCESS] Four synthetic Merchant accounts created."
    );

    console.log(
      "[SUCCESS] Existing accounts were not modified."
    );

    console.log(
      "[SUCCESS] Development test fixtures prepared."
    );

  } finally {
    await closeDatabases();
  }
}

run().catch(error => {
  console.error(
    "[FIXTURE SETUP FAILED]",
    error.name,
    error.code ?? ""
  );

  if (error.name === "AssertionError") {
    console.error(error.message);
  }

  process.exitCode = 1;
});
