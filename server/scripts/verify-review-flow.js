import assert from "node:assert/strict";
import { ObjectId } from "mongodb";

import {
  connectDatabases,
  closeDatabases,
  getMainDB,
  getAuditDB,
} from "../src/config/database.js";

// =====================================
// TEST ARGUMENTS
// =====================================

const [
  acceptedJobId,
  escalatedJobId,
  marker,
] = process.argv.slice(2);

// =====================================
// VERIFY ENCRYPTED ADDRESS
// =====================================

function verifyEncryption(record) {
  assert.ok(record, "Address record not found");

  const payload = record.encryptedPayload;

  assert.ok(payload, "Encrypted payload missing");

  assert.equal(
    payload.algorithm,
    "aes-256-gcm"
  );

  assert.equal(payload.version, 1);

  for (const field of [
    "iv",
    "authTag",
    "ciphertext",
  ]) {
    assert.equal(typeof payload[field], "string");

    assert.ok(
      payload[field].length > 0,
      `${field} is empty`
    );
  }

  // The synthetic test marker is present
  // in the original address and review notes.
  // It must not appear in plaintext storage.

  assert.equal(
    JSON.stringify(record).includes(marker),
    false,
    "Synthetic plaintext found in address document"
  );
}

// =====================================
// MAIN SECURITY VERIFICATION
// =====================================

async function run() {
  assert.ok(
    /^[a-f0-9]{24}$/i.test(acceptedJobId ?? "")
  );

  assert.ok(
    /^[a-f0-9]{24}$/i.test(escalatedJobId ?? "")
  );

  assert.ok(
    /^[a-f0-9]{16}$/i.test(marker ?? "")
  );

  try {
    await connectDatabases();

    const main = getMainDB();
    const audit = getAuditDB();

    const acceptedId =
      new ObjectId(acceptedJobId);

    const escalatedId =
      new ObjectId(escalatedJobId);

    const addresses =
      main.collection("address_requests");

    const accepted =
      await addresses.findOne({
        _id: acceptedId,
      });

    const escalated =
      await addresses.findOne({
        _id: escalatedId,
      });

    // =================================
    // AES-256-GCM STORAGE VERIFICATION
    // =================================

    verifyEncryption(accepted);
    verifyEncryption(escalated);

    assert.notEqual(
      accepted.encryptedPayload.iv,
      escalated.encryptedPayload.iv,
      "Unexpected identical encryption IVs"
    );

    console.log(
      "[PASS] Encrypted address storage verified"
    );

    // =================================
    // ACCEPTED ADDRESS VERIFICATION
    // =================================

    assert.equal(
      accepted.status,
      "confirmed"
    );

    assert.equal(
      accepted.decision,
      "confirmed"
    );

    assert.equal(
      accepted.saved,
      true
    );

    assert.ok(accepted.savedAt);

    assert.equal(
      accepted.reviewAssignment == null,
      true
    );

    assert.ok(
      Array.isArray(accepted.reviewHistory)
    );

    assert.ok(
      accepted.reviewHistory.some(
        (entry) =>
          entry.status === "resolved" &&
          entry.merchantDisposition ===
            "re_review_requested"
      ),
      "Archived re-review cycle missing"
    );

    assert.ok(
      accepted.reviewHistory.some(
        (entry) =>
          entry.status === "resolved" &&
          entry.merchantDisposition ===
            "accepted"
      ),
      "Archived merchant acceptance missing"
    );

    console.log(
      "[PASS] Accepted address and review history verified"
    );

    // =================================
    // ESCALATION VERIFICATION
    // =================================

    assert.equal(
      escalated.decision,
      "review_requested"
    );

    assert.equal(
      escalated.reviewAssignment?.status,
      "escalated"
    );

    assert.notEqual(
      escalated.status,
      "confirmed"
    );

    console.log(
      "[PASS] Escalation database state verified"
    );

    // =================================
    // AUDIT DATABASE VERIFICATION
    // =================================

    // Discover the audit collection instead
    // of assuming its collection name.

    const collections =
      await audit.listCollections(
        {},
        { nameOnly: true }
      ).toArray();

    const verifiedActions = new Set();

    for (const collection of collections) {
      if (
        collection.name.startsWith("system.")
      ) {
        continue;
      }

      const entries =
        await audit.collection(collection.name)
          .find(
            {
              targetId: {
                $in: [
                  acceptedJobId,
                  acceptedId,
                ],
              },

              action: {
                $in: [
                  "MERCHANT_REVIEW_ACCESS",
                  "MERCHANT_REVIEW_ACCEPT",
                ],
              },
            },

            {
              projection: {
                _id: 0,
                action: 1,
                result: 1,
              },
            }
          )
          .toArray();

      for (const entry of entries) {
        if (
          String(entry.result).toLowerCase() ===
          "success"
        ) {
          verifiedActions.add(entry.action);
        }
      }
    }

    assert.ok(
      verifiedActions.has(
        "MERCHANT_REVIEW_ACCESS"
      ),
      "Successful review access audit missing"
    );

    assert.ok(
      verifiedActions.has(
        "MERCHANT_REVIEW_ACCEPT"
      ),
      "Successful acceptance audit missing"
    );

    console.log(
      "[PASS] Successful review audit events verified"
    );

    console.log(
      "[SUCCESS] DATABASE SECURITY CHECKS PASSED"
    );

  } finally {
    await closeDatabases();
  }
}

run().catch((error) => {
  console.error(
    "[DATABASE_VERIFICATION_ERROR]",
    error.message
  );

  process.exitCode = 1;
});