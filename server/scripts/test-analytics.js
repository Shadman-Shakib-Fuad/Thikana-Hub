import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// =====================================
// TEST CONFIGURATION
// =====================================

const BASE =
  "http://127.0.0.1:5000/api/v1";

const ORIGIN =
  "http://localhost:3000";

const ANALYTICS =
  "/p14/analytics";

const SEARCH =
  "/p14/address-resolutions";

const FEEDBACK =
  "/p14/address-feedback";

const SAVED =
  "/p14/saved-addresses";

const MANAGE =
  "/p14/address-requests";

const sessions = [];

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
        ? { body: JSON.stringify(body) }
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

  return { response, data };
}

async function expect(
  promise,
  status,
  code
) {
  const result = await promise;

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

  if (status >= 200 && status < 300) {
    assert.equal(
      result.data.success,
      true
    );
  }

  return result.data;
}

function pass(message) {
  passed++;

  console.log(
    `[PASS ${passed}] ${message}`
  );
}

// =====================================
// DATE HELPERS
// =====================================

function dhakaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Dhaka",

      year: "numeric",

      month: "2-digit",

      day: "2-digit",
    }
  ).formatToParts(
    new Date(value)
  );

  const get = (type) =>
    parts.find(
      (part) => part.type === type
    )?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(value, days) {
  const date = new Date(
    `${value}T00:00:00.000Z`
  );

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date.toISOString().slice(0, 10);
}

// =====================================
// CREATE TEST MERCHANT
// =====================================

async function createMerchant(label) {
  const account = {
    name: `Analytics Test ${label}`,

    email:
      `analytics-${randomBytes(8).toString("hex")}@example.com`,

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

  assert.equal(
    login.response.status,
    200
  );

  const rawCookie =
    login.response.headers.get(
      "set-cookie"
    );

  assert.ok(rawCookie);

  const cookie =
    rawCookie.split(";")[0];

  sessions.push(cookie);

  console.log(
    `[SUCCESS] Merchant ${label} authenticated`
  );

  return cookie;
}

// =====================================
// ADDRESS HELPERS
// =====================================

function createAddress(
  cookie,
  address
) {
  return expect(
    request(SEARCH, {
      method: "POST",

      cookie,

      body: { address },
    }),

    201
  );
}

async function confirmAddress(
  cookie,
  job,
  localityName
) {
  const candidate =
    job.candidates.find(
      (item) =>
        item.locality.nameEn === localityName
    );

  assert.ok(
    candidate,
    `${localityName} candidate missing`
  );

  return expect(
    request(FEEDBACK, {
      method: "POST",

      cookie,

      body: {
        jobId: job.jobId,

        decision: "confirmed",

        localityId:
          candidate.localityId,

        revision: 0,
      },
    }),

    200
  );
}

function saveAddress(
  cookie,
  jobId,
  saved
) {
  return expect(
    request(
      `${SAVED}/${jobId}`,
      {
        method: "PATCH",

        cookie,

        body: {
          saved,

          revision: 0,
        },
      }
    ),

    200
  );
}

function getAnalytics(
  cookie,
  from,
  to
) {
  const params = new URLSearchParams();

  if (from !== undefined) {
    params.set("from", from);
  }

  if (to !== undefined) {
    params.set("to", to);
  }

  const query =
    params.toString();

  return request(
    query
      ? `${ANALYTICS}?${query}`
      : ANALYTICS,

    { cookie }
  );
}

// =====================================
// MAIN TEST FUNCTION
// =====================================

async function runTests() {
  console.log("");
  console.log("================================");
  console.log("  THIKANAHUB ANALYTICS TEST");
  console.log("================================");

  try {
    // Health check
    const health = await expect(
      request("/health"),
      200
    );

    assert.equal(
      health.status,
      "operational"
    );

    // Create isolated test merchants
    const a = await createMerchant("A");
    const b = await createMerchant("B");

    // Merchant A: confirmed and saved
    const confirmedA = await createAddress(
      a,
      "Kazipara, Mirpur, Dhaka"
    );

    await confirmAddress(
      a,
      confirmedA,
      "Kazipara"
    );

    await saveAddress(
      a,
      confirmedA.jobId,
      true
    );

    // Merchant A: awaiting decision
    const pendingA = await createAddress(
      a,
      "Shewrapara, Mirpur, Dhaka"
    );

    // Merchant A: no confident match
    const unknownA = await createAddress(
      a,
      "Xyzqwv Unknown Place"
    );

    assert.equal(
      unknownA.status,
      "no_confident_match"
    );

    // Merchant A: manual review requested
    const reviewA = await createAddress(
      a,
      "Abcxyz Unknown Location"
    );

    await expect(
      request(FEEDBACK, {
        method: "POST",

        cookie: a,

        body: {
          jobId: reviewA.jobId,

          decision: "no_correct_match",

          revision: 0,
        },
      }),

      200
    );

    // Merchant B: isolated address
    const pendingB = await createAddress(
      b,
      "Mirpur 10, Dhaka"
    );

    const allJobs = [
      confirmedA,
      pendingA,
      unknownA,
      reviewA,
      pendingB,
    ];

    const dates = allJobs
      .map((job) =>
        dhakaDate(job.createdAt)
      )
      .sort();

    const firstDay = dates[0];

    const lastDay =
      dates[dates.length - 1];

    const rangeFrom =
      addDays(firstDay, -2);

    const rangeTo = lastDay;

    // =================================
    // TEST 01: AUTHENTICATION
    // =================================

    await expect(
      getAnalytics(undefined),
      401
    );

    pass(
      "Unauthenticated analytics access rejected"
    );

    // =================================
    // TEST 02: STRICT QUERY VALIDATION
    // =================================

    await expect(
      request(
        `${ANALYTICS}?ownerId=another-user`,
        { cookie: a }
      ),

      400,

      "INVALID_ANALYTICS_QUERY"
    );

    await expect(
      request(
        `${ANALYTICS}?limit=10000`,
        { cookie: a }
      ),

      400
    );

    pass(
      "Unauthorized query parameters rejected"
    );

    // =================================
    // TEST 03: DATE VALIDATION
    // =================================

    await expect(
      getAnalytics(
        a,
        "2026-02-30",
        "2026-03-01"
      ),

      400,

      "INVALID_ANALYTICS_QUERY"
    );

    await expect(
      getAnalytics(
        a,
        firstDay
      ),

      400,

      "INVALID_DATE_RANGE"
    );

    pass(
      "Invalid and incomplete date ranges rejected"
    );

    // =================================
    // TEST 04: DATE RANGE LIMITS
    // =================================

    await expect(
      getAnalytics(
        a,
        addDays(firstDay, 1),
        firstDay
      ),

      400,

      "INVALID_DATE_RANGE"
    );

    await expect(
      getAnalytics(
        a,
        addDays(firstDay, -90),
        firstDay
      ),

      400,

      "INVALID_DATE_RANGE"
    );

    const tomorrow =
      addDays(dhakaDate(), 1);

    await expect(
      getAnalytics(
        a,
        tomorrow,
        tomorrow
      ),

      400,

      "INVALID_DATE_RANGE"
    );

    pass(
      "Reversed, excessive and future ranges rejected"
    );

    // =================================
    // TEST 05: ACCURATE SUMMARY
    // =================================

    const analyticsA = await expect(
      getAnalytics(
        a,
        rangeFrom,
        rangeTo
      ),

      200
    );

    assert.deepEqual(
      analyticsA.summary,

      {
        total: 4,

        confirmed: 1,

        reviewRequested: 1,

        awaitingDecision: 2,

        noConfidentMatch: 1,

        saved: 1,

        confirmationRate: 25,
      }
    );

    console.log(
      "[SUMMARY A]",
      analyticsA.summary
    );

    pass(
      "Merchant analytics summary is accurate"
    );

    // =================================
    // TEST 06: OWNER ISOLATION
    // =================================

    const analyticsB = await expect(
      getAnalytics(
        b,
        rangeFrom,
        rangeTo
      ),

      200
    );

    assert.deepEqual(
      analyticsB.summary,

      {
        total: 1,

        confirmed: 0,

        reviewRequested: 0,

        awaitingDecision: 1,

        noConfidentMatch: 0,

        saved: 0,

        confirmationRate: 0,
      }
    );

    pass(
      "Analytics are isolated by merchant"
    );

    // =================================
    // TEST 07: DAILY ACTIVITY
    // =================================

    assert.equal(
      analyticsA.range.from,
      rangeFrom
    );

    assert.equal(
      analyticsA.range.to,
      rangeTo
    );

    assert.equal(
      analyticsA.range.timeZone,
      "Asia/Dhaka"
    );

    assert.equal(
      analyticsA.daily.length,
      analyticsA.range.days
    );

    // Verify date ordering and zero-day filling
    analyticsA.daily.forEach(
      (row, index) => {
        assert.equal(
          row.date,
          addDays(rangeFrom, index)
        );
      }
    );

    assert.equal(
      analyticsA.daily[0].total,
      0
    );

    assert.equal(
      analyticsA.daily[1].total,
      0
    );

    const merchantAJobs = [
      confirmedA,
      pendingA,
      unknownA,
      reviewA,
    ];

    // Verify date-specific address counts
    for (const row of analyticsA.daily) {
      const expected = merchantAJobs.filter(
        (job) =>
          dhakaDate(job.createdAt) === row.date
      ).length;

      assert.equal(
        row.total,
        expected
      );
    }

    // Daily metrics must add up to summary
    for (const key of [
      "total",
      "confirmed",
      "reviewRequested",
      "awaitingDecision",
      "noConfidentMatch",
      "saved",
    ]) {
      const sum = analyticsA.daily.reduce(
        (total, row) =>
          total + row[key],
        0
      );

      assert.equal(
        sum,
        analyticsA.summary[key]
      );
    }

    pass(
      "Daily activity, date ordering and zero days work"
    );

    // =================================
    // TEST 08: EMPTY DATE RANGE
    // =================================

    const emptyDay =
      addDays(firstDay, -1);

    const empty = await expect(
      getAnalytics(
        a,
        emptyDay,
        emptyDay
      ),

      200
    );

    assert.equal(
      empty.summary.total,
      0
    );

    assert.equal(
      empty.summary.confirmationRate,
      0
    );

    assert.equal(
      empty.daily.length,
      1
    );

    assert.equal(
      empty.daily[0].total,
      0
    );

    pass(
      "Empty analytics range handled safely"
    );

    // =================================
    // TEST 09: LIVE SYNCHRONIZATION
    // =================================

    // Confirm previously pending address
    await confirmAddress(
      a,
      pendingA,
      "Shewrapara"
    );

    // Remove bookmark from original address
    await saveAddress(
      a,
      confirmedA.jobId,
      false
    );

    // Delete synthetic unmatched address
    await expect(
      request(
        `${MANAGE}/${unknownA.jobId}`,
        {
          method: "DELETE",

          cookie: a,

          body: {
            revision: 0,
          },
        }
      ),

      200
    );

    const updated = await expect(
      getAnalytics(
        a,
        rangeFrom,
        rangeTo
      ),

      200
    );

    assert.deepEqual(
      updated.summary,

      {
        total: 3,

        confirmed: 2,

        reviewRequested: 1,

        awaitingDecision: 0,

        noConfidentMatch: 0,

        saved: 0,

        confirmationRate: 66.7,
      }
    );

    console.log(
      "[UPDATED SUMMARY]",
      updated.summary
    );

    pass(
      "Analytics synchronize with confirmation, unsave and deletion"
    );

    // =================================
    // TEST 10: DEFAULT RANGE & PRIVACY
    // =================================

    const defaults = await expect(
      getAnalytics(a),

      200
    );

    assert.equal(
      defaults.range.days,
      7
    );

    assert.equal(
      defaults.daily.length,
      7
    );

    assert.equal(
      defaults.range.from,
      addDays(defaults.range.to, -6)
    );

    assert.deepEqual(
      Object.keys(defaults).sort(),

      [
        "success",
        "range",
        "summary",
        "daily",
        "generatedAt",
      ].sort()
    );

    assert.deepEqual(
      Object.keys(defaults.summary).sort(),

      [
        "total",
        "confirmed",
        "reviewRequested",
        "awaitingDecision",
        "noConfidentMatch",
        "saved",
        "confirmationRate",
      ].sort()
    );

    for (const row of defaults.daily) {
      assert.deepEqual(
        Object.keys(row).sort(),

        [
          "date",
          "total",
          "confirmed",
          "reviewRequested",
          "awaitingDecision",
          "noConfidentMatch",
          "saved",
        ].sort()
      );
    }

    const serialized =
      JSON.stringify(defaults);

    for (const forbidden of [
      "encryptedPayload",
      "originalAddress",
      "ownerId",
      "selectedCandidate",
      "Kazipara",
      "Shewrapara",
      confirmedA.jobId,
      pendingB.jobId,
    ]) {
      assert.equal(
        serialized.includes(forbidden),
        false
      );
    }

    pass(
      "Default range works without exposing private address data"
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
    console.log("ALL 10 ANALYTICS TESTS PASSED");

  } finally {
    // =================================
    // CLEANUP TEST SESSIONS
    // =================================

    console.log(
      "\n[CLEANUP] Revoking test sessions..."
    );

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
      sessions.length === 0
        ? "[CLEANUP] No active test sessions"
        : successful
          ? "[SUCCESS] Test sessions revoked"
          : "[WARNING] Session cleanup incomplete"
    );
  }
}

// =====================================
// EXECUTE TEST SCRIPT
// =====================================

runTests().catch((error) => {
  console.error("");
  console.error("================================");
  console.error("       ANALYTICS TEST ERROR");
  console.error("================================");

  console.error("Passed:", passed);
  console.error("Name:", error.name);
  console.error("Message:", error.message);
  console.error("Cause:", error.cause?.code || "N/A");
  console.error("Stack:", error.stack);

  console.error("================================");

  process.exitCode = 1;
});