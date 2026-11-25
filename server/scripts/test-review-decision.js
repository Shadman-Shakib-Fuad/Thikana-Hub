import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";

import { env } from "../src/config/env.js";

import {
  connectDatabases,
  closeDatabases,
  getMainDB,
  getAuditDB,
} from "../src/config/database.js";

import {
  provisionReviewer,
  assignReview,
} from "../src/services/reviewer-admin.service.js";

import {
  decryptData,
  addressAAD,
} from "../src/utils/encryption.js";

// =====================================
// TEST CONFIGURATION
// =====================================

const BASE =
  "http://127.0.0.1:5000/api/v1";

const ORIGIN =
  "http://localhost:3000";

const QUEUE =
  "/p14/reviewer/queue";

const KAZIPARA =
  "BD-DHA-MIR-KAZIPARA";

const sessions = [];

let passed = 0;

// =====================================
// HTTP HELPERS
// =====================================

async function request(
  endpoint,
  {
    method = "GET",
    cookie,
    body,
    origin = ORIGIN,
  } = {}
) {
  console.log(`[REQUEST] ${method} ${endpoint}`);

  const response = await fetch(
    BASE + endpoint,
    {
      method,

      headers: {
        "Content-Type": "application/json",
        Origin: origin,

        ...(cookie
          ? { Cookie: cookie }
          : {}),
      },

      ...(body !== undefined
        ? { body: JSON.stringify(body) }
        : {}),

      signal: AbortSignal.timeout(60000),
    }
  );

  const data = await response.json();

  console.log(`[RESPONSE] HTTP ${response.status}`);

  if (!response.ok) {
    console.log("[API CODE]", data.code);
    console.log("[MESSAGE]", data.message);
  }

  return { response, data };
}

function check(result, status, code) {
  assert.equal(
    result.response.status,
    status,
    result.data.message
  );

  if (code) {
    assert.equal(result.data.code, code);
  }

  if (status >= 200 && status < 300) {
    assert.equal(result.data.success, true);
  }

  return result.data;
}

async function expect(promise, status, code) {
  return check(
    await promise,
    status,
    code
  );
}

function pass(message) {
  passed++;

  console.log(`[PASS ${passed}] ${message}`);
}

// =====================================
// ACCOUNT HELPERS
// =====================================

async function createAccount(label, reviewer = false) {
  const account = {
    name: `Review Decision Test ${label}`,

    email:
      `review-decision-${randomBytes(8).toString("hex")}@example.com`,

    password:
      randomBytes(24).toString("hex"),
  };

  await expect(
    request("/auth/register", {
      method: "POST",
      body: account,
    }),
    201
  );

  if (reviewer) {
    const result =
      await provisionReviewer(account.email);

    assert.equal(
      result.role,
      "reviewer"
    );
  }

  const login = await request(
    "/auth/login",
    {
      method: "POST",

      body: {
        email: account.email,
        password: account.password,
      },
    }
  );

  check(login, 200);

  const rawCookie =
    login.response.headers.get("set-cookie");

  assert.ok(rawCookie);

  const cookie = rawCookie.split(";")[0];

  sessions.push(cookie);

  return {
    email: account.email,
    cookie,
  };
}

// =====================================
// REVIEW HELPERS
// =====================================

async function createReview(
  merchant,
  address,
  reviewer
) {
  const job = await expect(
    request("/p14/address-resolutions", {
      method: "POST",

      cookie: merchant.cookie,

      body: { address },
    }),

    201
  );

  await expect(
    request("/p14/address-feedback", {
      method: "POST",

      cookie: merchant.cookie,

      body: {
        jobId: job.jobId,
        decision: "no_correct_match",
        revision: 0,
      },
    }),

    200
  );

  if (reviewer) {
    await assignReview(
      job.jobId,
      reviewer.email
    );
  }

  return job;
}

function submit(cookie, jobId, body, origin = ORIGIN) {
  return request(
    `${QUEUE}/${jobId}/decision`,

    {
      method: "POST",
      cookie,
      body,
      origin,
    }
  );
}

function getLocalities(cookie, jobId) {
  return request(
    `${QUEUE}/${jobId}/localities`,
    { cookie }
  );
}

async function getStoredRecord(jobId) {
  return getMainDB()
    .collection("address_requests")
    .findOne({
      _id: new ObjectId(jobId),
    });
}

function decryptRecord(record) {
  return decryptData(
    record.encryptedPayload,

    env.ADDRESS_ENCRYPTION_KEY,

    addressAAD(
      record._id,
      record.ownerId
    )
  );
}

// =====================================
// MAIN TEST FUNCTION
// =====================================

async function runTests() {
  console.log("");
  console.log("================================");
  console.log(" THIKANAHUB REVIEW DECISION TEST ");
  console.log("================================");

  try {
    await connectDatabases();

    await expect(
      request("/health"),
      200
    );

    const merchant =
      await createAccount("Merchant");

    const reviewerA =
      await createAccount("Reviewer A", true);

    const reviewerB =
      await createAccount("Reviewer B", true);

    const job1 = await createReview(
      merchant,
      "Xyzqwv Unknown Place A",
      reviewerA
    );

    const job2 = await createReview(
      merchant,
      "Abcxyz Unknown Place B",
      reviewerA
    );

    const job3 = await createReview(
      merchant,
      "Zyxwvu Unknown Place C",
      reviewerA
    );

    const unassigned = await createReview(
      merchant,
      "Qwerty Unknown Place D"
    );

    const note =
      "Synthetic review: recommend Kazipara.";

    const validDecision = {
      decision: "resolved",

      localityId: KAZIPARA,

      note,

      revision: 0,
    };

    // =================================
    // TEST 01: ACCESS CONTROL
    // =================================

    await expect(
      submit(
        undefined,
        job1.jobId,
        validDecision
      ),
      401
    );

    await expect(
      submit(
        merchant.cookie,
        job1.jobId,
        validDecision
      ),
      403
    );

    await expect(
      submit(
        reviewerB.cookie,
        job1.jobId,
        validDecision
      ),
      404,
      "REVIEW_NOT_FOUND"
    );

    await expect(
      submit(
        reviewerA.cookie,
        unassigned.jobId,
        validDecision
      ),
      404,
      "REVIEW_NOT_FOUND"
    );

    await expect(
      submit(
        reviewerA.cookie,
        job1.jobId,
        validDecision,
        "https://untrusted.example"
      ),
      403,
      "UNTRUSTED_ORIGIN"
    );

    pass("Authentication, role, assignment and origin enforced");

    // =================================
    // TEST 02: STRICT INPUT VALIDATION
    // =================================

    for (const body of [
      {
        ...validDecision,
        note: "",
      },
      {
        ...validDecision,
        note: "x".repeat(1001),
      },
      {
        ...validDecision,
        revision: -1,
      },
      {
        ...validDecision,
        reviewerId: "another-user",
      },
      {
        decision: "resolved",
        note,
      },
      {
        decision: "escalated",
        localityId: KAZIPARA,
        revision: 0,
        note,
      },
    ]) {
      await expect(
        submit(
          reviewerA.cookie,
          job1.jobId,
          body
        ),

        400,

        "INVALID_REVIEW_DECISION"
      );
    }

    pass("Invalid and manipulated review decisions rejected");

    // =================================
    // TEST 03: APPROVED LOCALITIES
    // =================================

    const localities = await expect(
      getLocalities(
        reviewerA.cookie,
        job1.jobId
      ),

      200
    );

    const kazipara = localities.items.find(
      (item) =>
        item.localityId === KAZIPARA
    );

    assert.ok(kazipara);

    assert.equal(
      kazipara.locality.nameEn,
      "Kazipara"
    );

    const approvedRecords = await getMainDB()
      .collection("localities")
      .find(
        { approved: true },
        { projection: { id: 1 } }
      )
      .toArray();

    assert.deepEqual(
      localities.items
        .map((item) => item.localityId)
        .sort(),

      approvedRecords
        .map((item) => item.id)
        .sort()
    );

    await expect(
      getLocalities(
        reviewerB.cookie,
        job1.jobId
      ),

      404
    );

    pass("Approved locality list is assignment-protected");

    // =================================
    // TEST 04: STALE AND INVALID LOCALITY
    // =================================

    await expect(
      submit(
        reviewerA.cookie,
        job1.jobId,
        {
          ...validDecision,
          revision: 1,
        }
      ),

      409,

      "REVISION_CONFLICT"
    );

    await expect(
      submit(
        reviewerA.cookie,
        job1.jobId,
        {
          ...validDecision,
          localityId: "INVALID-LOCALITY-ID",
        }
      ),

      400,

      "INVALID_REVIEW_LOCALITY"
    );

    pass("Incorrect revisions and unapproved locality IDs rejected");

    // =================================
    // TEST 05: RESOLVE AND ENCRYPTION
    // =================================

    const before = await getStoredRecord(
      job1.jobId
    );

    const beforePayload =
      decryptRecord(before);

    const resolvedRequest = await submit(
      reviewerA.cookie,
      job1.jobId,
      validDecision
    );

    const resolved = check(
      resolvedRequest,
      200
    );

    assert.equal(
      resolved.reviewStatus,
      "resolved"
    );

    const stored = await getStoredRecord(
      job1.jobId
    );

    assert.equal(
      stored.reviewAssignment.status,
      "resolved"
    );

    assert.notEqual(
      stored.encryptedPayload.iv,
      before.encryptedPayload.iv
    );

    const decrypted =
      decryptRecord(stored);

    assert.equal(
      decrypted.originalAddress,
      beforePayload.originalAddress
    );

    assert.deepEqual(
      decrypted.candidates,
      beforePayload.candidates
    );

    assert.equal(
      decrypted.reviewOutcome.decision,
      "resolved"
    );

    assert.equal(
      decrypted.reviewOutcome.recommendation.localityId,
      KAZIPARA
    );

    assert.equal(
      decrypted.reviewOutcome.note,
      note
    );

    assert.equal(
      JSON.stringify(stored).includes(note),
      false
    );

    assert.equal(
      JSON.stringify(stored).includes(
        beforePayload.originalAddress
      ),
      false
    );

    // Reviewer does not overwrite
    // the merchant's confirmation.

    assert.equal(
      stored.decision,
      "review_requested"
    );

    assert.equal(
      stored.status,
      before.status
    );

    assert.equal(
      stored.revision ?? 0,
      0
    );

    pass("Review recommendation securely encrypted");

    // =================================
    // TEST 06: DUPLICATE DECISION
    // =================================

    await expect(
      submit(
        reviewerA.cookie,
        job1.jobId,
        validDecision
      ),

      409,

      "REVIEW_ALREADY_DECIDED"
    );

    await expect(
      request(
        `${QUEUE}/${job1.jobId}`,
        { cookie: reviewerA.cookie }
      ),

      404
    );

    pass("Repeated decisions and completed address access blocked");

    // =================================
    // TEST 07: ESCALATION
    // =================================

    const escalationNote =
      "Synthetic review: approved dataset is insufficient.";

    const escalated = await expect(
      submit(
        reviewerA.cookie,
        job2.jobId,
        {
          decision: "escalated",

          note: escalationNote,

          revision: 0,
        }
      ),

      200
    );

    assert.equal(
      escalated.reviewStatus,
      "escalated"
    );

    const escalationRecord =
      await getStoredRecord(job2.jobId);

    const escalationPayload =
      decryptRecord(escalationRecord);

    assert.equal(
      escalationRecord.reviewAssignment.status,
      "escalated"
    );

    assert.equal(
      escalationPayload.reviewOutcome.recommendation,
      null
    );

    assert.equal(
      escalationPayload.reviewOutcome.note,
      escalationNote
    );

    assert.equal(
      JSON.stringify(escalationRecord)
        .includes(escalationNote),

      false
    );

    pass("Escalation recorded with encrypted reason");

    // =================================
    // TEST 08: CONCURRENT DECISION
    // =================================

    const concurrent = await Promise.all([
      submit(
        reviewerA.cookie,
        job3.jobId,
        validDecision
      ),

      submit(
        reviewerA.cookie,
        job3.jobId,
        {
          decision: "escalated",
          note: "Synthetic concurrent escalation.",
          revision: 0,
        }
      ),
    ]);

    assert.deepEqual(
      concurrent
        .map((item) => item.response.status)
        .sort((a, b) => a - b),

      [200, 409]
    );

    const winner = concurrent.find(
      (item) =>
        item.response.status === 200
    );

    const finalRecord =
      await getStoredRecord(job3.jobId);

    assert.equal(
      finalRecord.reviewAssignment.status,
      winner.data.reviewStatus
    );

    assert.equal(
      decryptRecord(finalRecord)
        .reviewOutcome.decision,

      winner.data.reviewStatus
    );

    pass("Concurrent submissions permit only one final decision");

    // =================================
    // TEST 09: REVIEW HISTORY
    // =================================

    const pending = await expect(
      request(
        QUEUE,
        { cookie: reviewerA.cookie }
      ),

      200
    );

    assert.equal(
      pending.items.length,
      0
    );

    const resolvedHistory = await expect(
      request(
        `${QUEUE}?status=resolved`,
        { cookie: reviewerA.cookie }
      ),

      200
    );

    const escalatedHistory = await expect(
      request(
        `${QUEUE}?status=escalated`,
        { cookie: reviewerA.cookie }
      ),

      200
    );

    assert.equal(
      resolvedHistory.items.length +
      escalatedHistory.items.length,

      3
    );

    assert.ok(
      resolvedHistory.items.some(
        (item) =>
          item.jobId === job1.jobId
      )
    );

    assert.ok(
      escalatedHistory.items.some(
        (item) =>
          item.jobId === job2.jobId
      )
    );

    const otherHistory = await expect(
      request(
        `${QUEUE}?status=resolved`,
        { cookie: reviewerB.cookie }
      ),

      200
    );

    assert.equal(
      otherHistory.items.length,
      0
    );

    for (const history of [
      resolvedHistory,
      escalatedHistory,
    ]) {
      const text = JSON.stringify(history);

      for (const forbidden of [
        "originalAddress",
        "encryptedPayload",
        "reviewOutcome",
        "ownerId",
        note,
        escalationNote,
      ]) {
        assert.equal(
          text.includes(forbidden),
          false
        );
      }
    }

    pass("Pending queue and private decision history synchronized");

    // =================================
    // TEST 10: AUDIT AND MERCHANT LOCK
    // =================================

    const requestId =
      resolvedRequest.response.headers.get(
        "x-request-id"
      );

    assert.ok(requestId);

    const audit = await getAuditDB()
      .collection("audit_events")
      .findOne({
        requestId,

        action: "REVIEW_RESOLVE",

        result: "success",
      });

    assert.ok(
      audit,
      "Review resolution audit missing"
    );

    assert.equal(
      JSON.stringify(audit).includes(note),
      false
    );

    await expect(
      request(
        `/p14/address-requests/${job1.jobId}`,
        {
          method: "PATCH",

          cookie: merchant.cookie,

          body: {
            address: "Kazipara, Mirpur, Dhaka",

            revision: 0,
          },
        }
      ),

      409,

      "REVIEW_LOCKED"
    );

    await expect(
      request(
        `/p14/address-requests/${job1.jobId}`,
        {
          method: "DELETE",

          cookie: merchant.cookie,

          body: {
            revision: 0,
          },
        }
      ),

      409,

      "REVIEW_LOCKED"
    );

    pass("Review audit and merchant review lock verified");

    // =================================
    // FINAL RESULT
    // =================================

    console.log("");
    console.log("================================");
    console.log("       FINAL TEST RESULT");
    console.log("================================");

    console.log("Total Tests: 10");
    console.log("Passed:", passed);
    console.log("Failed: 0");

    console.log("================================");
    console.log("ALL 10 REVIEW DECISION TESTS PASSED");

  } finally {
    console.log("\n[CLEANUP] Revoking test sessions...");

    try {
      const cleanup = await Promise.allSettled(
        sessions.map((cookie) =>
          request("/auth/logout", {
            method: "POST",
            cookie,
          })
        )
      );

      const successful = cleanup.every(
        (result) =>
          result.status === "fulfilled" &&
          result.value.response.ok
      );

      console.log(
        successful
          ? "[SUCCESS] Test sessions revoked"
          : "[WARNING] Session cleanup incomplete"
      );

    } finally {
      await closeDatabases();
    }
  }
}

runTests().catch((error) => {
  console.error("\nREVIEW DECISION TEST ERROR");
  console.error("Passed:", passed);
  console.error("Message:", error.message);
  console.error("Code:", error.code || "N/A");
  console.error("Cause:", error.cause?.code || "N/A");
  console.error(error.stack);

  process.exitCode = 1;
});