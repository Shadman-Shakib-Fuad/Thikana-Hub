import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const BASE = "http://127.0.0.1:5000/api/v1";

const ORIGIN = "http://localhost:3000";

const SEARCH = "/p14/address-resolutions";

const FEEDBACK = "/p14/address-feedback";

const HISTORY = "/p14/address-history";

const sessions = [];

let passed = 0;

// =====================================
// API REQUEST HELPER
// =====================================

async function request(
  endpoint,
  {
    method = "GET",
    body,
    cookie,
    origin = ORIGIN,
  } = {}
) {
  console.log(`[REQUEST] ${method} ${endpoint}`);

  const response = await fetch(
    `${BASE}${endpoint}`,
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

  console.log(
    `[RESPONSE] HTTP ${response.status}`
  );

  if (!response.ok) {
    console.log(
      "[API CODE]",
      data.code || "N/A"
    );
  }

  return { response, data };
}

function expectStatus(result, expected) {
  assert.equal(
    result.response.status,
    expected,
    `Expected HTTP ${expected}, received ${result.response.status}`
  );
}

function pass(message) {
  passed++;

  console.log(`[PASS ${passed}] ${message}`);
}

// =====================================
// CREATE TEST MERCHANT
// =====================================

async function createMerchant(label) {
  const account = {
    name: `Merchant Test ${label}`,

    email:
      `merchant-${randomBytes(8).toString("hex")}@example.com`,

    password:
      randomBytes(24).toString("hex"),
  };

  const registered = await request(
    "/auth/register",
    {
      method: "POST",
      body: account,
    }
  );

  expectStatus(registered, 201);

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

  expectStatus(login, 200);

  const rawCookie =
    login.response.headers.get("set-cookie");

  assert.ok(
    rawCookie,
    "Session cookie missing"
  );

  const cookie = rawCookie.split(";")[0];

  sessions.push(cookie);

  console.log(
    `[SUCCESS] Merchant ${label} authenticated`
  );

  return cookie;
}

// =====================================
// CREATE ADDRESS REQUEST
// =====================================

async function createAddress(cookie, address) {
  const result = await request(
    SEARCH,
    {
      method: "POST",
      cookie,
      body: { address },
    }
  );

  expectStatus(result, 201);

  assert.equal(result.data.success, true);

  return result.data;
}

// =====================================
// MAIN MERCHANT API TESTS
// =====================================

async function runTests() {
  console.log("");
  console.log("================================");
  console.log("   THIKANAHUB MERCHANT API TEST");
  console.log("================================");

  try {
    const health = await request("/health");

    expectStatus(health, 200);

    assert.equal(
      health.data.status,
      "operational"
    );

    // Create independent test merchants
    const cookieA = await createMerchant("A");
    const cookieB = await createMerchant("B");

    // Two addresses for Merchant A
    const addressA = await createAddress(
      cookieA,
      "বাসা ১২, Kazipara, মিরপুর, Dhaka"
    );

    const unknownA = await createAddress(
      cookieA,
      "Xyzqwv Unknown Place"
    );

    // One address for Merchant B
    const addressB = await createAddress(
      cookieB,
      "Shewrapara, Mirpur, Dhaka"
    );

    const localityId =
      addressA.candidates[0]?.localityId;

    assert.ok(localityId);

    assert.equal(
      unknownA.status,
      "no_confident_match"
    );

    const confirmation = {
      jobId: addressA.jobId,
      decision: "confirmed",
      localityId,
    };

    // =====================================
    // TEST 01: UNAUTHENTICATED FEEDBACK
    // =====================================

    const anonymous = await request(
      FEEDBACK,
      {
        method: "POST",
        body: confirmation,
      }
    );

    expectStatus(anonymous, 401);

    pass("Unauthenticated feedback rejected");

    // =====================================
    // TEST 02: PARAMETER MANIPULATION
    // =====================================

    const manipulated = await request(
      FEEDBACK,
      {
        method: "POST",
        cookie: cookieA,

        body: {
          ...confirmation,
          ownerId: "unauthorized-owner",
          status: "confirmed",
        },
      }
    );

    expectStatus(manipulated, 400);

    pass("Unauthorized parameters rejected");

    // =====================================
    // TEST 03: CROSS-USER CONFIRMATION
    // =====================================

    const crossUser = await request(
      FEEDBACK,
      {
        method: "POST",
        cookie: cookieB,
        body: confirmation,
      }
    );

    expectStatus(crossUser, 404);

    pass("Cross-user confirmation rejected");

    // =====================================
    // TEST 04: INVALID CANDIDATE
    // =====================================

    const invalidCandidate = await request(
      FEEDBACK,
      {
        method: "POST",
        cookie: cookieA,

        body: {
          ...confirmation,
          localityId: "INVALID-LOCALITY",
        },
      }
    );

    expectStatus(invalidCandidate, 400);

    assert.equal(
      invalidCandidate.data.code,
      "INVALID_CANDIDATE"
    );

    pass("Invalid candidate rejected");

    // =====================================
    // TEST 05: UNTRUSTED ORIGIN
    // =====================================

    const wrongOrigin = await request(
      FEEDBACK,
      {
        method: "POST",
        cookie: cookieA,
        origin: "https://untrusted.example",
        body: confirmation,
      }
    );

    expectStatus(wrongOrigin, 403);

    pass("Untrusted origin rejected");

    // =====================================
    // TEST 06: VALID CONFIRMATION
    // =====================================

    const confirmed = await request(
      FEEDBACK,
      {
        method: "POST",
        cookie: cookieA,
        body: confirmation,
      }
    );

    expectStatus(confirmed, 200);

    assert.equal(
      confirmed.data.status,
      "confirmed"
    );

    assert.equal(
      confirmed.data.selectedCandidate.localityId,
      localityId
    );

    assert.equal(
      confirmed.data.requiresConfirmation,
      false
    );

    pass("Valid candidate confirmed");

    // =====================================
    // TEST 07: DUPLICATE DECISION
    // =====================================

    const duplicate = await request(
      FEEDBACK,
      {
        method: "POST",
        cookie: cookieA,
        body: confirmation,
      }
    );

    expectStatus(duplicate, 409);

    pass("Duplicate confirmation prevented");

    // =====================================
    // TEST 08: PERSISTED CONFIRMATION
    // =====================================

    const saved = await request(
      `/jobs/${addressA.jobId}`,
      {
        cookie: cookieA,
      }
    );

    expectStatus(saved, 200);

    assert.equal(
      saved.data.status,
      "confirmed"
    );

    assert.equal(
      saved.data.decision,
      "confirmed"
    );

    assert.equal(
      saved.data.selectedCandidate.localityId,
      localityId
    );

    assert.equal(
      saved.data.originalAddress,
      "বাসা ১২, Kazipara, মিরপুর, Dhaka"
    );

    pass("Encrypted confirmation retrieved");

    // =====================================
    // TEST 09: NO CORRECT MATCH FEEDBACK
    // =====================================

    const feedback = await request(
      FEEDBACK,
      {
        method: "POST",
        cookie: cookieA,

        body: {
          jobId: unknownA.jobId,
          decision: "no_correct_match",
        },
      }
    );

    expectStatus(feedback, 200);

    assert.equal(
      feedback.data.decision,
      "review_requested"
    );

    assert.equal(
      feedback.data.status,
      "needs_review"
    );

    assert.equal(
      feedback.data.selectedCandidate,
      null
    );

    pass("Manual review request recorded");

    // =====================================
    // TEST 10: OWN HISTORY
    // =====================================

    const historyA = await request(
      HISTORY,
      {
        cookie: cookieA,
      }
    );

    expectStatus(historyA, 200);

    assert.equal(
      historyA.data.items.length,
      2
    );

    const idsA = historyA.data.items.map(
      (item) => item.jobId
    );

    assert.ok(
      idsA.includes(addressA.jobId)
    );

    assert.ok(
      idsA.includes(unknownA.jobId)
    );

    const historyB = await request(
      HISTORY,
      {
        cookie: cookieB,
      }
    );

    expectStatus(historyB, 200);

    assert.equal(
      historyB.data.items.length,
      1
    );

    assert.equal(
      historyB.data.items[0].jobId,
      addressB.jobId
    );

    assert.ok(
      !idsA.includes(addressB.jobId)
    );

    pass("Merchant history is isolated");

    // =====================================
    // TEST 11: CURSOR PAGINATION
    // =====================================

    const firstPage = await request(
      `${HISTORY}?limit=1`,
      {
        cookie: cookieA,
      }
    );

    expectStatus(firstPage, 200);

    assert.equal(
      firstPage.data.items.length,
      1
    );

    assert.equal(
      firstPage.data.pagination.hasMore,
      true
    );

    const cursor =
      firstPage.data.pagination.nextCursor;

    assert.ok(cursor);

    const secondPage = await request(
      `${HISTORY}?limit=1&cursor=${encodeURIComponent(cursor)}`,
      {
        cookie: cookieA,
      }
    );

    expectStatus(secondPage, 200);

    assert.equal(
      secondPage.data.items.length,
      1
    );

    assert.notEqual(
      firstPage.data.items[0].jobId,
      secondPage.data.items[0].jobId
    );

    assert.equal(
      secondPage.data.pagination.hasMore,
      false
    );

    pass("History pagination works");

    // =====================================
    // TEST 12: HISTORY SECURITY
    // =====================================

    const privateHistory = await request(
      HISTORY
    );

    expectStatus(privateHistory, 401);

    const invalidLimit = await request(
      `${HISTORY}?limit=10000`,
      {
        cookie: cookieA,
      }
    );

    expectStatus(invalidLimit, 400);

    const ownerManipulation = await request(
      `${HISTORY}?ownerId=another-user`,
      {
        cookie: cookieA,
      }
    );

    expectStatus(ownerManipulation, 400);

    pass("History authentication and validation work");

    // =====================================
    // FINAL RESULT
    // =====================================

    console.log("");
    console.log("================================");
    console.log("       FINAL TEST RESULT");
    console.log("================================");
    console.log("Total Tests: 12");
    console.log("Passed:", passed);
    console.log("Failed: 0");
    console.log("================================");
    console.log("ALL 12 MERCHANT API TESTS PASSED");

  } finally {
    console.log("\n[CLEANUP] Revoking test sessions...");

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
  }
}

runTests().catch((error) => {
  console.error("");
  console.error("================================");
  console.error("        MERCHANT TEST ERROR");
  console.error("================================");
  console.error("Passed:", passed);
  console.error("Name:", error.name);
  console.error("Message:", error.message);
  console.error("Code:", error.code || "N/A");
  console.error("Cause:", error.cause?.code || "N/A");
  console.error("Stack:", error.stack);
  console.error("================================");

  process.exitCode = 1;
});