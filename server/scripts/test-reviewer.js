import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  connectDatabases,
  closeDatabases,
  getAuditDB,
} from "../src/config/database.js";

import {
  provisionReviewer,
  assignReview,
} from "../src/services/reviewer-admin.service.js";

// =====================================
// TEST CONFIGURATION
// =====================================

const BASE =
  "http://127.0.0.1:5000/api/v1";

const ORIGIN =
  "http://localhost:3000";

const QUEUE =
  "/p14/reviewer/queue";

const SEARCH =
  "/p14/address-resolutions";

const FEEDBACK =
  "/p14/address-feedback";

const MANAGE =
  "/p14/address-requests";

const sessions = new Set();

let passed = 0;

// =====================================
// API REQUEST HELPER
// =====================================

async function request(
  endpoint,
  {
    method = "GET",
    cookie,
    body,
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
        "Content-Type":
          "application/json",

        Origin: ORIGIN,

        ...(cookie
          ? { Cookie: cookie }
          : {}),
      },

      ...(body !== undefined
        ? {
            body:
              JSON.stringify(body),
          }
        : {}),

      signal:
        AbortSignal.timeout(60000),
    }
  );

  const data = await response.json();

  console.log(
    `[RESPONSE] HTTP ${response.status}`
  );

  if (!response.ok) {
    console.log(
      "[API CODE]",
      data.code || "N/A"
    );

    console.log(
      "[MESSAGE]",
      data.message || "N/A"
    );
  }

  return {
    response,
    data,
  };
}

function check(result, status, code) {
  assert.equal(
    result.response.status,
    status,
    result.data.message
  );

  if (code) {
    assert.equal(
      result.data.code,
      code
    );
  }

  if (
    status >= 200 &&
    status < 300
  ) {
    assert.equal(
      result.data.success,
      true
    );
  }

  return result.data;
}

async function expect(
  promise,
  status,
  code
) {
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
// CREATE TEST ACCOUNT
// =====================================

async function register(label) {
  const account = {
    name: `Reviewer Test ${label}`,

    email:
      `review-test-${randomBytes(8).toString("hex")}@example.com`,

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

  return account;
}

async function login(account) {
  const result = await request(
    "/auth/login",
    {
      method: "POST",

      body: {
        email: account.email,

        password: account.password,
      },
    }
  );

  check(result, 200);

  const rawCookie =
    result.response.headers.get(
      "set-cookie"
    );

  assert.ok(
    rawCookie,
    "Session cookie missing"
  );

  const cookie =
    rawCookie.split(";")[0];

  sessions.add(cookie);

  return cookie;
}

// =====================================
// ADDRESS AND REVIEW HELPERS
// =====================================

async function createAddress(
  cookie,
  address
) {
  return expect(
    request(SEARCH, {
      method: "POST",

      cookie,

      body: {
        address,
      },
    }),

    201
  );
}

async function createReview(
  cookie,
  address
) {
  const job = await createAddress(
    cookie,
    address
  );

  await expect(
    request(FEEDBACK, {
      method: "POST",

      cookie,

      body: {
        jobId: job.jobId,

        decision: "no_correct_match",

        revision: 0,
      },
    }),

    200
  );

  return job;
}

function getQueue(
  cookie,
  query = ""
) {
  return request(
    `${QUEUE}${query}`,
    { cookie }
  );
}

function getDetails(
  cookie,
  jobId
) {
  return request(
    `${QUEUE}/${jobId}`,
    { cookie }
  );
}

// =====================================
// MAIN TEST FUNCTION
// =====================================

async function runTests() {
  console.log("");
  console.log("================================");
  console.log("   THIKANAHUB REVIEWER TEST");
  console.log("================================");

  try {
    await connectDatabases();

    const health = await expect(
      request("/health"),
      200
    );

    assert.equal(
      health.status,
      "operational"
    );

    // =================================
    // TEST 01: AUTHENTICATION
    // =================================

    await expect(
      getQueue(undefined),
      401
    );

    pass(
      "Unauthenticated reviewer access rejected"
    );

    // Create Merchant

    const merchant = await register(
      "Merchant"
    );

    const merchantCookie =
      await login(merchant);

    // Create dedicated Reviewer accounts

    const accountA = await register(
      "Reviewer A"
    );

    const accountB = await register(
      "Reviewer B"
    );

    // Previous merchant session for A

    const oldSessionA =
      await login(accountA);

    // Provision new reviewers using
    // the same trusted operator service
    // used by the administration CLI.

    const provisionedA =
      await provisionReviewer(
        accountA.email
      );

    const provisionedB =
      await provisionReviewer(
        accountB.email
      );

    assert.equal(
      provisionedA.role,
      "reviewer"
    );

    assert.equal(
      provisionedB.role,
      "reviewer"
    );

    const reviewerA =
      await login(accountA);

    const reviewerB =
      await login(accountB);

    // =================================
    // TEST 02: ROLE AUTHORIZATION
    // =================================

    await expect(
      getQueue(merchantCookie),
      403
    );

    await expect(
      request("/p14/analytics", {
        cookie: reviewerA,
      }),

      403
    );

    await expect(
      request(SEARCH, {
        method: "POST",

        cookie: reviewerA,

        body: {
          address: "Kazipara, Mirpur, Dhaka",
        },
      }),

      403
    );

    pass(
      "Merchant and reviewer role boundaries enforced"
    );

    // Create synthetic review requests

    const reviewA1 = await createReview(
      merchantCookie,
      "Xyzqwv Unknown Place A"
    );

    const reviewA2 = await createReview(
      merchantCookie,
      "Abcxyz Unknown Location B"
    );

    const reviewB1 = await createReview(
      merchantCookie,
      "Qwerty Unknown Place C"
    );

    const unassigned = await createReview(
      merchantCookie,
      "Zyxwvu Unknown Location D"
    );

    const ordinaryAddress =
      await createAddress(
        merchantCookie,
        "Kazipara, Mirpur, Dhaka"
      );

    // =================================
    // TEST 03: ROLE PROVISIONING
    // =================================

    await expect(
      getQueue(oldSessionA),
      401
    );

    // Already-revoked session does not
    // need further logout attempts.

    sessions.delete(
      oldSessionA
    );

    await assert.rejects(
      () => provisionReviewer(
        merchant.email
      ),

      {
        code: "ACCOUNT_HAS_ADDRESSES",
      }
    );

    pass(
      "Old sessions revoked and existing merchant protected"
    );

    // =================================
    // TEST 04: UNASSIGNED PROTECTION
    // =================================

    const emptyQueue = await expect(
      getQueue(reviewerA),
      200
    );

    assert.equal(
      emptyQueue.items.length,
      0
    );

    await expect(
      getDetails(
        reviewerA,
        unassigned.jobId
      ),

      404,

      "REVIEW_NOT_FOUND"
    );

    pass(
      "Unassigned requests are inaccessible"
    );

    // =================================
    // TEST 05: ASSIGNMENT VALIDATION
    // =================================

    await assert.rejects(
      () => assignReview(
        reviewA1.jobId,
        merchant.email
      ),

      {
        code: "REVIEWER_NOT_AVAILABLE",
      }
    );

    await assert.rejects(
      () => assignReview(
        ordinaryAddress.jobId,
        accountA.email
      ),

      {
        code: "REVIEW_NOT_ASSIGNABLE",
      }
    );

    // Concurrent attempts to assign
    // the same review.

    const concurrent =
      await Promise.allSettled([
        assignReview(
          reviewA1.jobId,
          accountA.email
        ),

        assignReview(
          reviewA1.jobId,
          accountA.email
        ),
      ]);

    assert.equal(
      concurrent.filter(
        (result) =>
          result.status === "fulfilled"
      ).length,

      1
    );

    const rejected = concurrent.find(
      (result) =>
        result.status === "rejected"
    );

    assert.equal(
      rejected?.reason.code,
      "REVIEW_NOT_ASSIGNABLE"
    );

    // Assign remaining requests

    await assignReview(
      reviewA2.jobId,
      accountA.email
    );

    await assignReview(
      reviewB1.jobId,
      accountB.email
    );

    pass(
      "Invalid and duplicate assignments rejected"
    );

    // =================================
    // TEST 06: QUEUE ISOLATION
    // =================================

    const queueA = await expect(
      getQueue(reviewerA),
      200
    );

    const queueB = await expect(
      getQueue(reviewerB),
      200
    );

    assert.deepEqual(
      queueA.items
        .map((item) => item.jobId)
        .sort(),

      [
        reviewA1.jobId,
        reviewA2.jobId,
      ].sort()
    );

    assert.deepEqual(
      queueB.items.map(
        (item) => item.jobId
      ),

      [
        reviewB1.jobId,
      ]
    );

    const serialized =
      JSON.stringify(queueA);

    for (const forbidden of [
      "originalAddress",
      "encryptedPayload",
      "ownerId",
      "reviewerId",
      "passwordHash",
      "Xyzqwv Unknown Place A",
      reviewB1.jobId,
      unassigned.jobId,
    ]) {
      assert.equal(
        serialized.includes(forbidden),
        false
      );
    }

    pass(
      "Reviewer queues isolated without private address content"
    );

    // =================================
    // TEST 07: AUTHORIZED DETAILS
    // =================================

    const allowed = await getDetails(
      reviewerA,
      reviewA1.jobId
    );

    const detail = check(
      allowed,
      200
    );

    assert.equal(
      detail.jobId,
      reviewA1.jobId
    );

    assert.equal(
      detail.originalAddress,
      "Xyzqwv Unknown Place A"
    );

    assert.equal(
      detail.reviewStatus,
      "pending"
    );

    assert.equal(
      detail.decision,
      "review_requested"
    );

    assert.equal(
      detail.revision,
      0
    );

    assert.ok(
      Array.isArray(detail.candidates)
    );

    for (const key of [
      "ownerId",
      "encryptedPayload",
      "passwordHash",
      "reviewerId",
    ]) {
      assert.equal(
        Object.hasOwn(detail, key),
        false
      );
    }

    assert.equal(
      allowed.response.headers.get(
        "cache-control"
      ),

      "no-store"
    );

    pass(
      "Assigned reviewer can securely read address details"
    );

    // =================================
    // TEST 08: CROSS-REVIEWER ACCESS
    // =================================

    const denied = await getDetails(
      reviewerB,
      reviewA1.jobId
    );

    check(
      denied,
      404,
      "REVIEW_NOT_FOUND"
    );

    await expect(
      getDetails(
        reviewerA,
        reviewB1.jobId
      ),

      404,

      "REVIEW_NOT_FOUND"
    );

    await expect(
      getDetails(
        reviewerA,
        unassigned.jobId
      ),

      404,

      "REVIEW_NOT_FOUND"
    );

    await expect(
      getDetails(
        merchantCookie,
        reviewA1.jobId
      ),

      403
    );

    pass(
      "Cross-reviewer and unauthorized detail access rejected"
    );

    // =================================
    // TEST 09: VALIDATION AND PAGINATION
    // =================================

    await expect(
      getQueue(
        reviewerA,
        "?reviewerId=another-user"
      ),

      400,

      "INVALID_REVIEW_QUERY"
    );

    await expect(
      getQueue(
        reviewerA,
        "?limit=21"
      ),

      400,

      "INVALID_REVIEW_QUERY"
    );

    await expect(
      getQueue(
        reviewerA,
        "?cursor=invalid"
      ),

      400,

      "INVALID_REVIEW_QUERY"
    );

    await expect(
      getDetails(
        reviewerA,
        "invalid-job"
      ),

      400,

      "INVALID_REVIEW_ID"
    );

    const page1 = await expect(
      getQueue(
        reviewerA,
        "?limit=1"
      ),

      200
    );

    assert.equal(
      page1.items.length,
      1
    );

    assert.equal(
      page1.pagination.hasMore,
      true
    );

    assert.ok(
      page1.pagination.nextCursor
    );

    const page2 = await expect(
      getQueue(
        reviewerA,

        "?limit=1&cursor=" +
        encodeURIComponent(
          page1.pagination.nextCursor
        )
      ),

      200
    );

    assert.equal(
      page2.items.length,
      1
    );

    assert.notEqual(
      page1.items[0].jobId,

      page2.items[0].jobId
    );

    assert.equal(
      page2.pagination.hasMore,
      false
    );

    pass(
      "Reviewer pagination and strict validation work"
    );

    // =================================
    // TEST 10: AUDIT AND REVIEW LOCK
    // =================================

    const auditCollection =
      getAuditDB()
        .collection("audit_events");

    const allowedRequestId =
      allowed.response.headers.get(
        "x-request-id"
      );

    const deniedRequestId =
      denied.response.headers.get(
        "x-request-id"
      );

    assert.ok(allowedRequestId);
    assert.ok(deniedRequestId);

    const successAudit =
      await auditCollection.findOne({
        requestId: allowedRequestId,

        action: "REVIEW_DETAIL_ACCESS",

        result: "success",
      });

    const deniedAudit =
      await auditCollection.findOne({
        requestId: deniedRequestId,

        action: "REVIEW_DETAIL_ACCESS",

        result: "denied",
      });

    assert.ok(
      successAudit,
      "Successful access audit missing"
    );

    assert.ok(
      deniedAudit,
      "Denied access audit missing"
    );

    // Merchant cannot edit an assigned
    // manual review request.

    await expect(
      request(
        `${MANAGE}/${reviewA1.jobId}`,
        {
          method: "PATCH",

          cookie: merchantCookie,

          body: {
            address: "Kazipara, Dhaka",

            revision: 0,
          },
        }
      ),

      409,

      "REVIEW_LOCKED"
    );

    // Merchant cannot delete it either.

    await expect(
      request(
        `${MANAGE}/${reviewA1.jobId}`,
        {
          method: "DELETE",

          cookie: merchantCookie,

          body: {
            revision: 0,
          },
        }
      ),

      409,

      "REVIEW_LOCKED"
    );

    pass(
      "Reviewer access audited and merchant review lock retained"
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
    console.log("ALL 10 REVIEWER TESTS PASSED");

  } finally {
    // =================================
    // CLEANUP TEST SESSIONS
    // =================================

    console.log(
      "\n[CLEANUP] Revoking test sessions..."
    );

    try {
      const cleanup =
        await Promise.allSettled(
          [...sessions].map((cookie) =>
            request("/auth/logout", {
              method: "POST",

              cookie,
            })
          )
        );

      const successful =
        cleanup.every(
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
// EXECUTE TEST SCRIPT
// =====================================

runTests().catch((error) => {
  console.error("");
  console.error("================================");
  console.error("       REVIEWER TEST ERROR");
  console.error("================================");

  console.error(
    "Passed:",
    passed
  );

  console.error(
    "Name:",
    error.name
  );

  console.error(
    "Message:",
    error.message
  );

  console.error(
    "Code:",
    error.code || "N/A"
  );

  console.error(
    "Cause:",
    error.cause?.code || "N/A"
  );

  console.error(
    "Stack:",
    error.stack
  );

  console.error("================================");

  process.exitCode = 1;
});