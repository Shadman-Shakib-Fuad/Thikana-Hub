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

const REVIEW =
  "/p14/merchant-reviews";

const KAZIPARA =
  "BD-DHA-MIR-KAZIPARA";

const sessions = [];

let passed = 0;

// =====================================
// HTTP REQUEST HELPER
// =====================================

async function request(
  endpoint,
  {
    method = "GET",
    cookie,
    body,
    origin = ORIGIN,
    assignment,
  } = {}
) {
  console.log(
    `[REQUEST] ${method} ${endpoint}`
  );

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

        ...(assignment
          ? {
              "X-Review-Assignment":
                assignment,
            }
          : {}),
      },

      ...(body !== undefined
        ? { body: JSON.stringify(body) }
        : {}),

      signal: AbortSignal.timeout(60000),
    }
  );

  const data = await response.json();

  console.log(
    `[RESPONSE] HTTP ${response.status}`
  );

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

  console.log(
    `[PASS ${passed}] ${message}`
  );
}

// =====================================
// ACCOUNT HELPERS
// =====================================

async function createAccount(
  label,
  reviewer = false
) {
  const account = {
    name: `Merchant Review Test ${label}`,

    email:
      `merchant-review-${randomBytes(8).toString("hex")}@example.com`,

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
    const provisioned =
      await provisionReviewer(account.email);

    assert.equal(
      provisioned.role,
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

  const cookie =
    rawCookie.split(";")[0];

  sessions.push(cookie);

  return {
    email: account.email,
    cookie,
  };
}

// =====================================
// ADDRESS & REVIEW HELPERS
// =====================================

function requestManualReview(
  merchant,
  jobId,
  revision
) {
  return expect(
    request("/p14/address-feedback", {
      method: "POST",

      cookie: merchant.cookie,

      body: {
        jobId,

        decision: "no_correct_match",

        revision,
      },
    }),

    200
  );
}

async function createReview(
  merchant,
  address
) {
  const job = await expect(
    request("/p14/address-resolutions", {
      method: "POST",

      cookie: merchant.cookie,

      body: { address },
    }),

    201
  );

  await requestManualReview(
    merchant,
    job.jobId,
    0
  );

  return job;
}

function getReview(cookie, jobId) {
  return request(
    `${REVIEW}/${jobId}`,
    { cookie }
  );
}

function getReviewerDetail(
  reviewer,
  jobId
) {
  return expect(
    request(
      `${QUEUE}/${jobId}`,
      { cookie: reviewer.cookie }
    ),

    200
  );
}

function resolveReview(
  reviewer,
  jobId,
  revision,
  assignment,
  note
) {
  return request(
    `${QUEUE}/${jobId}/decision`,
    {
      method: "POST",

      cookie: reviewer.cookie,

      assignment,

      body: {
        decision: "resolved",

        localityId: KAZIPARA,

        revision,

        note,
      },
    }
  );
}

async function assignAndResolve(
  reviewer,
  jobId,
  note
) {
  await assignReview(
    jobId,
    reviewer.email
  );

  const detail = await getReviewerDetail(
    reviewer,
    jobId
  );

  await expect(
    resolveReview(
      reviewer,
      jobId,
      detail.revision,
      detail.assignedAt,
      note
    ),

    200
  );

  return detail;
}

function merchantDecision(
  cookie,
  jobId,
  body,
  origin = ORIGIN
) {
  return request(
    `${REVIEW}/${jobId}/decision`,
    {
      method: "POST",
      cookie,
      body,
      origin,
    }
  );
}

function decisionBody(
  review,
  decision = "accept"
) {
  return {
    decision,

    revision: review.revision,

    reviewVersion: review.reviewVersion,
  };
}

async function storedRecord(jobId) {
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

function saveAddress(
  merchant,
  jobId,
  revision
) {
  return expect(
    request(
      `/p14/saved-addresses/${jobId}`,
      {
        method: "PATCH",

        cookie: merchant.cookie,

        body: {
          saved: true,
          revision,
        },
      }
    ),

    200
  );
}

// =====================================
// MAIN TEST SUITE
// =====================================

async function runTests() {
  console.log("");
  console.log("================================");
  console.log(" THIKANAHUB MERCHANT REVIEW TEST");
  console.log("================================");

  try {
    await connectDatabases();

    await expect(
      request("/health"),
      200
    );

    const merchant =
      await createAccount("Merchant A");

    const otherMerchant =
      await createAccount("Merchant B");

    const reviewer =
      await createAccount("Reviewer", true);

    const job1 = await createReview(
      merchant,
      "Xyzqwv Synthetic Place A"
    );

    const job2 = await createReview(
      merchant,
      "Abcxyz Synthetic Place B"
    );

    const job3 = await createReview(
      merchant,
      "Zyxwvu Synthetic Place C"
    );

    const job4 = await createReview(
      merchant,
      "Qwerty Synthetic Place D"
    );

    const note =
      "Synthetic reviewer recommendation for Kazipara.";

    // =================================
    // TEST 01: ACCESS CONTROL
    // =================================

    await expect(
      getReview(undefined, job1.jobId),
      401
    );

    await expect(
      getReview(reviewer.cookie, job1.jobId),
      403
    );

    await expect(
      getReview(
        otherMerchant.cookie,
        job1.jobId
      ),

      404,

      "REVIEW_NOT_FOUND"
    );

    await expect(
      merchantDecision(
        otherMerchant.cookie,

        job1.jobId,

        {
          decision: "accept",
          revision: 0,
          reviewVersion: "0".repeat(64),
        }
      ),

      404,

      "REVIEW_NOT_FOUND"
    );

    pass(
      "Merchant review authentication, role and ownership enforced"
    );

    // =================================
    // TEST 02: REVIEW STATUS TRACKING
    // =================================

    const unassigned = await expect(
      getReview(
        merchant.cookie,
        job1.jobId
      ),

      200
    );

    assert.equal(
      unassigned.reviewStatus,
      "unassigned"
    );

    assert.equal(unassigned.outcome, null);
    assert.equal(unassigned.canAccept, false);

    await assignReview(
      job1.jobId,
      reviewer.email
    );

    const pending = await expect(
      getReview(
        merchant.cookie,
        job1.jobId
      ),

      200
    );

    assert.equal(
      pending.reviewStatus,
      "pending"
    );

    assert.equal(pending.outcome, null);
    assert.equal(pending.reviewVersion, null);

    pass(
      "Unassigned and pending review status tracked"
    );

    // =================================
    // TEST 03: RECOMMENDATION ACCESS
    // =================================

    const detail1 = await getReviewerDetail(
      reviewer,
      job1.jobId
    );

    await expect(
      resolveReview(
        reviewer,
        job1.jobId,
        detail1.revision,
        detail1.assignedAt,
        note
      ),

      200
    );

    const review1 = await expect(
      getReview(
        merchant.cookie,
        job1.jobId
      ),

      200
    );

    assert.equal(
      review1.reviewStatus,
      "resolved"
    );

    assert.equal(
      review1.outcome.recommendation.localityId,
      KAZIPARA
    );

    assert.equal(
      review1.outcome.note,
      note
    );

    assert.equal(
      review1.canAccept,
      true
    );

    assert.equal(
      review1.canRequestReReview,
      true
    );

    assert.match(
      review1.reviewVersion,
      /^[a-f0-9]{64}$/
    );

    assert.equal(
      Object.hasOwn(
        review1.outcome,
        "reviewerId"
      ),

      false
    );

    await expect(
      getReview(
        otherMerchant.cookie,
        job1.jobId
      ),

      404
    );

    pass(
      "Review recommendation visible only to address owner"
    );

    // =================================
    // TEST 04: INVALID & STALE REQUESTS
    // =================================

    const accept1 = decisionBody(review1);

    await expect(
      merchantDecision(
        merchant.cookie,
        job1.jobId,
        {
          ...accept1,
          ownerId: "another-user",
        }
      ),

      400,

      "INVALID_MERCHANT_REVIEW_DECISION"
    );

    await expect(
      merchantDecision(
        merchant.cookie,
        job1.jobId,
        {
          ...accept1,
          revision: 1,
        }
      ),

      409,

      "REVISION_CONFLICT"
    );

    await expect(
      merchantDecision(
        merchant.cookie,
        job1.jobId,
        {
          ...accept1,
          reviewVersion: "0".repeat(64),
        }
      ),

      409,

      "REVIEW_VERSION_CONFLICT"
    );

    await expect(
      merchantDecision(
        merchant.cookie,
        job1.jobId,
        accept1,
        "https://untrusted.example"
      ),

      403,

      "UNTRUSTED_ORIGIN"
    );

    pass(
      "Invalid, stale and untrusted merchant decisions rejected"
    );

    // =================================
    // TEST 05: ACCEPT & SYNCHRONIZE
    // =================================

    const acceptedRequest =
      await merchantDecision(
        merchant.cookie,
        job1.jobId,
        accept1
      );

    const accepted =
      check(acceptedRequest, 200);

    assert.equal(
      accepted.reviewStatus,
      "accepted"
    );

    assert.equal(
      accepted.status,
      "confirmed"
    );

    assert.equal(
      accepted.selectedCandidate.localityId,
      KAZIPARA
    );

    assert.equal(
      accepted.selectedCandidate.matchType,
      "manual_review"
    );

    assert.equal(
      accepted.selectedCandidate.score,
      null
    );

    const detailAfterAccept = await expect(
      request(
        `/jobs/${job1.jobId}`,
        { cookie: merchant.cookie }
      ),

      200
    );

    assert.equal(
      detailAfterAccept.status,
      "confirmed"
    );

    assert.equal(
      detailAfterAccept.selectedCandidate.localityId,
      KAZIPARA
    );

    const history = await expect(
      request(
        "/p14/address-history",
        { cookie: merchant.cookie }
      ),

      200
    );

    assert.ok(
      history.items.some(
        (item) =>
          item.jobId === job1.jobId &&
          item.status === "confirmed"
      )
    );

    await saveAddress(
      merchant,
      job1.jobId,
      0
    );

    const saved = await expect(
      request(
        "/p14/saved-addresses",
        { cookie: merchant.cookie }
      ),

      200
    );

    assert.ok(
      saved.items.some(
        (item) =>
          item.jobId === job1.jobId
      )
    );

    const analytics = await expect(
      request(
        "/p14/analytics",
        { cookie: merchant.cookie }
      ),

      200
    );

    assert.equal(
      analytics.summary.total,
      4
    );

    assert.equal(
      analytics.summary.confirmed,
      1
    );

    assert.equal(
      analytics.summary.saved,
      1
    );

    assert.equal(
      analytics.summary.reviewRequested,
      3
    );

    pass(
      "Accepted review synchronized with history, saved addresses and analytics"
    );

    // =================================
    // TEST 06: ARCHIVE & DUPLICATE
    // =================================

    const record1 = await storedRecord(
      job1.jobId
    );

    assert.equal(
      Object.hasOwn(
        record1,
        "reviewAssignment"
      ),

      false
    );

    assert.equal(
      record1.reviewHistory.length,
      1
    );

    assert.equal(
      record1.reviewHistory[0].merchantDisposition,
      "accepted"
    );

    const decrypted1 =
      decryptRecord(record1);

    assert.equal(
      decrypted1.reviewOutcome.note,
      note
    );

    assert.equal(
      decrypted1.reviewOutcome.merchantDisposition,
      "accepted"
    );

    assert.equal(
      JSON.stringify(record1).includes(note),
      false
    );

    const reviewerHistory = await expect(
      request(
        `${QUEUE}?status=resolved`,
        { cookie: reviewer.cookie }
      ),

      200
    );

    assert.ok(
      reviewerHistory.items.some(
        (item) =>
          item.jobId === job1.jobId &&
          item.merchantDisposition === "accepted"
      )
    );

    const acceptedResult = await expect(
      getReview(
        merchant.cookie,
        job1.jobId
      ),

      200
    );

    assert.equal(
      acceptedResult.reviewStatus,
      "accepted"
    );

    assert.equal(
      acceptedResult.canAccept,
      false
    );

    await expect(
      merchantDecision(
        merchant.cookie,
        job1.jobId,
        accept1
      ),

      409,

      "REVIEW_NOT_DECIDABLE"
    );

    pass(
      "Accepted review archived and duplicate decisions blocked"
    );

    // =================================
    // TEST 07: RE-REVIEW & REASSIGNMENT
    // =================================

    const previousAssignment =
      await assignAndResolve(
        reviewer,
        job2.jobId,
        note
      );

    const firstReview2 = await expect(
      getReview(
        merchant.cookie,
        job2.jobId
      ),

      200
    );

    const reopened = await expect(
      merchantDecision(
        merchant.cookie,
        job2.jobId,

        decisionBody(
          firstReview2,
          "request_re_review"
        )
      ),

      200
    );

    assert.equal(
      reopened.reviewStatus,
      "unassigned"
    );

    assert.equal(
      reopened.decision,
      "review_requested"
    );

    const reopenedRecord =
      await storedRecord(job2.jobId);

    const reopenedPayload =
      decryptRecord(reopenedRecord);

    assert.equal(
      reopenedRecord.reviewHistory[0].merchantDisposition,
      "re_review_requested"
    );

    assert.equal(
      Object.hasOwn(
        reopenedPayload,
        "reviewOutcome"
      ),

      false
    );

    assert.equal(
      reopenedPayload.reviewOutcomeHistory[0].note,
      note
    );

    await assignReview(
      job2.jobId,
      reviewer.email
    );

    const newAssignment =
      await getReviewerDetail(
        reviewer,
        job2.jobId
      );

    assert.notEqual(
      newAssignment.assignedAt,
      previousAssignment.assignedAt
    );

    // Stale assignment must fail.

    await expect(
      resolveReview(
        reviewer,
        job2.jobId,
        0,
        previousAssignment.assignedAt,
        note
      ),

      409,

      "REVIEW_DECISION_CONFLICT"
    );

    // Missing assignment must also fail.

    await expect(
      resolveReview(
        reviewer,
        job2.jobId,
        0,
        undefined,
        note
      ),

      409,

      "REVIEW_DECISION_CONFLICT"
    );

    await expect(
      resolveReview(
        reviewer,
        job2.jobId,
        0,
        newAssignment.assignedAt,
        "Synthetic second review recommendation."
      ),

      200
    );

    const secondReview2 = await expect(
      getReview(
        merchant.cookie,
        job2.jobId
      ),

      200
    );

    assert.notEqual(
      secondReview2.reviewVersion,
      firstReview2.reviewVersion
    );

    // Old merchant token must fail.

    await expect(
      merchantDecision(
        merchant.cookie,
        job2.jobId,
        decisionBody(firstReview2)
      ),

      409,

      "REVIEW_VERSION_CONFLICT"
    );

    await expect(
      merchantDecision(
        merchant.cookie,
        job2.jobId,
        decisionBody(secondReview2)
      ),

      200
    );

    pass(
      "Re-review, reassignment and stale-cycle protection work"
    );

    // =================================
    // TEST 08: CONCURRENT DECISIONS
    // =================================

    await assignAndResolve(
      reviewer,
      job3.jobId,
      note
    );

    const review3 = await expect(
      getReview(
        merchant.cookie,
        job3.jobId
      ),

      200
    );

    const concurrent = await Promise.all([
      merchantDecision(
        merchant.cookie,
        job3.jobId,
        decisionBody(review3, "accept")
      ),

      merchantDecision(
        merchant.cookie,
        job3.jobId,

        decisionBody(
          review3,
          "request_re_review"
        )
      ),
    ]);

    assert.deepEqual(
      concurrent
        .map((item) => item.response.status)
        .sort((a, b) => a - b),

      [200, 409]
    );

    const concurrentRecord =
      await storedRecord(job3.jobId);

    assert.equal(
      concurrentRecord.reviewHistory.length,
      1
    );

    const winner = concurrent.find(
      (item) => item.response.status === 200
    );

    assert.equal(
      concurrentRecord.decision,
      winner.data.decision
    );

    pass(
      "Concurrent merchant decisions allow only one final update"
    );

    // =================================
    // TEST 09: EDIT ACCEPTED ADDRESS
    // =================================

    const edited = await expect(
      request(
        `/p14/address-requests/${job1.jobId}`,
        {
          method: "PATCH",

          cookie: merchant.cookie,

          body: {
            address: "Shewrapara, Mirpur, Dhaka",

            revision: 0,
          },
        }
      ),

      200
    );

    assert.equal(
      edited.revision,
      1
    );

    assert.equal(
      edited.saved,
      false
    );

    const editedRecord =
      await storedRecord(job1.jobId);

    assert.equal(
      editedRecord.reviewHistory.length,
      1
    );

    assert.equal(
      Object.hasOwn(
        decryptRecord(editedRecord),
        "reviewOutcome"
      ),

      false
    );

    await requestManualReview(
      merchant,
      job1.jobId,
      1
    );

    await assignReview(
      job1.jobId,
      reviewer.email
    );

    const editedDetail =
      await getReviewerDetail(
        reviewer,
        job1.jobId
      );

    assert.equal(
      editedDetail.revision,
      1
    );

    assert.equal(
      editedDetail.originalAddress,
      "Shewrapara, Mirpur, Dhaka"
    );

    assert.notEqual(
      editedDetail.assignedAt,
      detail1.assignedAt
    );

    pass(
      "Accepted address can be edited and assigned for a new review"
    );

    // =================================
    // TEST 10: ESCALATION & AUDIT
    // =================================

    await assignReview(
      job4.jobId,
      reviewer.email
    );

    const detail4 =
      await getReviewerDetail(
        reviewer,
        job4.jobId
      );

    await expect(
      request(
        `${QUEUE}/${job4.jobId}/decision`,
        {
          method: "POST",

          cookie: reviewer.cookie,

          assignment:
            detail4.assignedAt,

          body: {
            decision: "escalated",

            revision: 0,

            note:
              "Synthetic escalation requires further review.",
          },
        }
      ),

      200
    );

    const escalated = await expect(
      getReview(
        merchant.cookie,
        job4.jobId
      ),

      200
    );

    assert.equal(
      escalated.reviewStatus,
      "escalated"
    );

    assert.equal(
      escalated.canAccept,
      false
    );

    assert.equal(
      escalated.outcome.recommendation,
      null
    );

    await expect(
      merchantDecision(
        merchant.cookie,
        job4.jobId,
        {
          decision: "accept",

          revision: 0,

          reviewVersion: "0".repeat(64),
        }
      ),

      409,

      "REVIEW_NOT_DECIDABLE"
    );

    const auditRequestId =
      acceptedRequest.response.headers.get(
        "x-request-id"
      );

    assert.ok(auditRequestId);

    const audit = await getAuditDB()
      .collection("audit_events")
      .findOne({
        requestId: auditRequestId,

        action: "MERCHANT_REVIEW_ACCEPT",

        result: "success",
      });

    assert.ok(
      audit,
      "Merchant acceptance audit missing"
    );

    assert.equal(
      JSON.stringify(audit).includes(note),
      false
    );

    pass(
      "Escalation protected and merchant decision audited"
    );

    // =================================
    // FINAL TEST RESULT
    // =================================

    console.log("");
    console.log("================================");
    console.log("       FINAL TEST RESULT");
    console.log("================================");

    console.log("Total Tests: 10");
    console.log("Passed:", passed);
    console.log("Failed: 0");

    console.log("================================");
    console.log(
      "ALL 10 MERCHANT REVIEW TESTS PASSED"
    );

  } finally {
    console.log(
      "\n[CLEANUP] Revoking test sessions..."
    );

    try {
      const cleanup =
        await Promise.allSettled(
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

// =====================================
// EXECUTE TEST SUITE
// =====================================

runTests().catch((error) => {
  console.error(
    "\nMERCHANT REVIEW TEST ERROR"
  );

  console.error("Passed:", passed);
  console.error("Name:", error.name);
  console.error("Message:", error.message);
  console.error("Code:", error.code || "N/A");
  console.error("Cause:", error.cause?.code || "N/A");

  console.error(error.stack);

  process.exitCode = 1;
});