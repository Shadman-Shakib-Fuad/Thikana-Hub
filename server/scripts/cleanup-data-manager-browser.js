import assert from "node:assert/strict";

import {
  connectDatabases,
  closeDatabases,
  getMainDB,
} from "../src/config/database.js";

async function run() {
  assert.equal(
    process.env.NODE_ENV,
    "development",
    "Development environment required."
  );

  const marker = process.argv[2];

  assert.ok(
    typeof marker === "string" &&
    /^[a-f0-9]{16}$/.test(marker),
    "Invalid test fixture marker."
  );

  const roles = [
    "merchant",
    "reviewer",
    "manager",
    "admin",
  ];

  const emails = roles.map(
    role => `dm-browser-${role}-${marker}@example.com`
  );

  const localityId =
    `BD-TEST-BROWSER-${marker.toUpperCase()}`;

  try {
    await connectDatabases();

    const db = getMainDB();

    const users = await db.collection("users")
      .find(
        { email: { $in: emails } },
        {
          projection: {
            _id: 1,
            email: 1,
            name: 1,
          },
        }
      )
      .toArray();

    for (const user of users) {
      const role = roles.find(
        item =>
          user.email ===
          `dm-browser-${item}-${marker}@example.com`
      );

      assert.equal(
        user.name,
        `DM Browser Test ${role}`,
        "Test account identity mismatch."
      );
    }

    const manager = users.find(
      user => user.email === emails[2]
    );

    const merchant = users.find(
      user => user.email === emails[0]
    );

    const localities = db.collection("localities");

    const locality = await localities.findOne({
      id: localityId,
    });

    if (locality) {
      assert.ok(manager, "Test manager not found.");

      const proposals = await db
        .collection("locality_proposals")
        .find({
          localityId,
          requestedBy: manager._id,
          operation: "create",
          status: "approved",
        })
        .toArray();

      const source = proposals
        .map(
          proposal =>
            `Admin-approved proposal ${proposal._id}`
        )
        .find(
          value => value === locality.source
        );

      assert.ok(
        source,
        "Locality ownership could not be verified."
      );

      const removed = await localities.deleteOne({
        _id: locality._id,
        id: localityId,
        source,
      });

      assert.equal(removed.deletedCount, 1);
    }

    if (manager) {
      for (const name of [
        "locality_proposals",
        "locality_term_proposals",
      ]) {
        await db.collection(name).deleteMany({
          localityId,
          requestedBy: manager._id,
        });
      }
    }

    if (merchant) {
      // This account is unique to the current test run.

      await db.collection("address_requests")
        .deleteMany({
          ownerId: merchant._id,
        });
    }

    if (users.length) {
      await db.collection("share_tokens").deleteMany({ ownerId: { $in: users.map(user => user._id) } });
      await db.collection("sessions")
        .deleteMany({
          userId: {
            $in: users.map(user => user._id),
          },
        });
    }

    console.log(
      "[CLEANUP] Synthetic locality, proposals and addresses removed."
    );

    console.log(
      "[CLEANUP] Test sessions revoked."
    );

    console.log(
      "[INFO] Synthetic accounts and audit evidence retained."
    );

  } finally {
    await closeDatabases();
  }
}

run().catch(error => {
  console.error(
    "[CLEANUP FAILED]",
    error.message
  );

  process.exitCode = 1;
});
