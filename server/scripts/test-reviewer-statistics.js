import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  connectDatabases,
  closeDatabases,
} from "../src/config/database.js";

import {
  provisionReviewer,
  assignReview,
} from "../src/services/reviewer-admin.service.js";

const BASE = "http://127.0.0.1:5000/api/v1";
const ORIGIN = "http://localhost:3000";

const STATS = "/p14/reviewer/statistics";
const QUEUE = "/p14/reviewer/queue";
const REVIEW = "/p14/merchant-reviews";

const sessions = [];

let passed = 0;

// =====================================
// REQUEST HELPERS
// =====================================

async function request(
  endpoint,
  {
    method = "GET",
    cookie,
    body,
    assignment,
  } = {}
) {
  console.log(`[REQUEST] ${method} ${endpoint}`);

  const response = await fetch(
    BASE + endpoint,
    {
      method,

      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,

        ...(cookie
          ? { Cookie: cookie }
          : {}),

        ...(assignment
          ? {
              "X-Review-Assignment": assignment,
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

async function expect(promise, status, code) {
  const result = await promise;

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

function pass(message) {
  passed++;
  console.log(`[PASS ${passed}] ${message}`);
}

// =====================================
// ACCOUNT HELPERS
// =====================================

async function account(label, reviewer = false) {
  const input = {
    name: `Statistics Test ${label}`,

    email:
      `stats-${randomBytes(8).toString("hex")}@example.com`,

    password:
      randomBytes(24).toString("hex"),
  };

  await expect(
    request("/auth/register", {
      method: "POST",
      body: input,
    }),
    201
  );

  if (reviewer) {
    await provisionReviewer(input.email);
  }

  const login = await request(
    "/auth/login",
    {
      method: "POST",

      body: {
        email: input.email,
        password: input.password,
      },
    }
  );

  assert.equal(login.response.status, 200);

  const rawCookie =
    login.response.headers.get("set-cookie");

  assert.ok(rawCookie);

  const cookie = rawCookie.split(";")[0];

  sessions.push(cookie);

  return {
    email: input.email,
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

async function submitReview(
  reviewer,
  jobId,
  decision
) {
  const detail = await expect(
    request(`${QUEUE}/${jobId}`, {
      cookie: reviewer.cookie,
    }),
    200
  );

  return expect(
    request(`${QUEUE}/${jobId}/decision`, {
      method: "POST",
      cookie: reviewer.cookie,
      assignment: detail.assignedAt,

      body: {
        decision,
        revision: detail.revision,
        note: "Synthetic statistics test review.",

        ...(decision === "resolved"
          ? {
              localityId:
                "BD-DHA-MIR-KAZIPARA",
            }
          : {}),
      },
    }),
    200
  );
}

async function stats(reviewer, expected) {
  const result = await expect(
    request(STATS, {
      cookie: reviewer.cookie,
    }),
    200
  );

  assert.deepEqual(
    result.summary,
    expected
  );

  console.log("[SUMMARY]", result.summary);

  return result;
}

// =====================================
// MAIN TEST FUNCTION
// =====================================

async function runTests() {
  console.log("\nTHIKANAHUB REVIEWER STATISTICS TEST");

  try {
    await connectDatabases();

    await expect(request("/health"), 200);

    // TEST 01: Authentication

    await expect(
      request(STATS),
      401
    );

    pass("Unauthenticated statistics access rejected");

    const merchant = await account("Merchant");
    const a = await account("Reviewer A", true);
    const b = await account("Reviewer B", true);

    // TEST 02: Role and query validation

    await expect(
      request(STATS, {
        cookie: merchant.cookie,
      }),
      403
    );

    await expect(
      request(`${STATS}?reviewerId=other`, {
        cookie: a.cookie,
      }),
      400,
      "INVALID_STATISTICS_QUERY"
    );

    pass("Role and query validation enforced");

    // TEST 03: Empty statistics

    await stats(a, {
      pending: 0,
      resolved: 0,
      escalated: 0,
      merchantAccepted: 0,
    });

    pass("Empty reviewer statistics handled correctly");

    // Create isolated synthetic review records

    const job1 = await createReview(
      merchant,
      "Xyzqwv Synthetic Statistics A",
      a
    );

    const job2 = await createReview(
      merchant,
      "Abcxyz Synthetic Statistics B",
      a
    );

    await createReview(
      merchant,
      "Zyxwvu Synthetic Statistics C",
      b
    );

    await createReview(
      merchant,
      "Qwerty Synthetic Statistics D"
    );

    // TEST 04: Assignment isolation

    await stats(a, {
      pending: 2,
      resolved: 0,
      escalated: 0,
      merchantAccepted: 0,
    });

    await stats(b, {
      pending: 1,
      resolved: 0,
      escalated: 0,
      merchantAccepted: 0,
    });

    pass("Statistics isolated by reviewer assignment");

    // TEST 05: Resolve and escalation

    await submitReview(
      a,
      job1.jobId,
      "resolved"
    );

    await submitReview(
      a,
      job2.jobId,
      "escalated"
    );

    await stats(a, {
      pending: 0,
      resolved: 1,
      escalated: 1,
      merchantAccepted: 0,
    });

    pass("Resolve and escalation update statistics");

    // TEST 06: Merchant acceptance archive

    const review = await expect(
      request(`${REVIEW}/${job1.jobId}`, {
        cookie: merchant.cookie,
      }),
      200
    );

    await expect(
      request(
        `${REVIEW}/${job1.jobId}/decision`,
        {
          method: "POST",
          cookie: merchant.cookie,

          body: {
            decision: "accept",
            revision: review.revision,
            reviewVersion: review.reviewVersion,
          },
        }
      ),
      200
    );

    await stats(a, {
      pending: 0,
      resolved: 1,
      escalated: 1,
      merchantAccepted: 1,
    });

    // Edit accepted address and start
    // a new review cycle.

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

    await expect(
      request("/p14/address-feedback", {
        method: "POST",
        cookie: merchant.cookie,

        body: {
          jobId: job1.jobId,
          decision: "no_correct_match",
          revision: edited.revision,
        },
      }),
      200
    );

    await assignReview(
      job1.jobId,
      a.email
    );

    await stats(a, {
      pending: 1,
      resolved: 1,
      escalated: 1,
      merchantAccepted: 1,
    });

    pass("Archived acceptance survives a new review cycle");

    // TEST 07: Privacy and isolation after updates

    const result = await request(
      STATS,
      { cookie: a.cookie }
    );

    assert.equal(
      result.response.status,
      200
    );

    assert.equal(
      result.response.headers.get("cache-control"),
      "no-store"
    );

    assert.deepEqual(
      Object.keys(result.data).sort(),
      [
        "success",
        "summary",
        "generatedAt",
      ].sort()
    );

    assert.deepEqual(
      Object.keys(result.data.summary).sort(),
      [
        "pending",
        "resolved",
        "escalated",
        "merchantAccepted",
      ].sort()
    );

    const text = JSON.stringify(result.data);

    for (const forbidden of [
      "originalAddress",
      "encryptedPayload",
      "ownerId",
      "reviewerId",
      job1.jobId,
      job2.jobId,
      "Synthetic statistics test review.",
    ]) {
      assert.equal(
        text.includes(forbidden),
        false
      );
    }

    await stats(b, {
      pending: 1,
      resolved: 0,
      escalated: 0,
      merchantAccepted: 0,
    });

    pass("Statistics expose only authorized aggregate metadata");

    console.log("\n================================");
    console.log("FINAL TEST RESULT");
    console.log("Total Tests: 7");
    console.log("Passed:", passed);
    console.log("Failed: 0");
    console.log("ALL 7 REVIEWER STATISTICS TESTS PASSED");
    console.log("================================");

  } finally {
    console.log("\n[CLEANUP] Revoking test sessions...");

    try {
      const results = await Promise.allSettled(
        sessions.map((cookie) =>
          request("/auth/logout", {
            method: "POST",
            cookie,
          })
        )
      );

      const successful = results.every(
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
  console.error("\nREVIEWER STATISTICS TEST ERROR");
  console.error("Passed:", passed);
  console.error("Message:", error.message);
  console.error("Code:", error.code || "N/A");
  console.error(error.stack);

  process.exitCode = 1;
});