import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const BASE = "http://127.0.0.1:5000/api/v1";

const ORIGIN = "http://localhost:3000";

// =====================================
// API REQUEST HELPER
// =====================================

async function request(
  endpoint,
  {
    method = "GET",
    body,
    cookie,
  } = {}
) {
  console.log(`[REQUEST] ${method} ${endpoint}`);

  const response = await fetch(
    `${BASE}${endpoint}`,
    {
      method,

      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,

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

  console.log(
    `[RESPONSE] HTTP ${response.status}`
  );

  const data = await response.json();

  if (!response.ok) {
    console.log(
      "[API CODE]",
      data.code || "N/A"
    );
  }

  return {
    response,
    data,
  };
}

// =====================================
// BACKEND HEALTH CHECK
// =====================================

async function checkHealth() {
  console.log("\n[TEST] Checking Backend Health...");

  const result = await request("/health");

  assert.equal(result.response.status, 200);

  assert.equal(result.data.success, true);

  assert.equal(result.data.status, "operational");

  console.log("[SUCCESS] Backend is operational");
}

// =====================================
// CREATE TEMPORARY TEST ACCOUNT
// =====================================

async function createTestAccount(label) {
  console.log(
    `\n[TEST] Creating Merchant Account ${label}...`
  );

  const account = {
    name: `Address Test Merchant ${label}`,

    email:
      `address-${randomBytes(8).toString("hex")}@example.com`,

    password:
      randomBytes(24).toString("hex"),
  };

  // Register account
  const registered = await request(
    "/auth/register",
    {
      method: "POST",
      body: account,
    }
  );

  assert.equal(
    registered.response.status,
    201,
    `Account ${label} registration failed`
  );

  console.log(
    `[SUCCESS] Account ${label} registered`
  );

  // Login account
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
    200,
    `Account ${label} login failed`
  );

  const cookie =
    login.response.headers.get("set-cookie");

  assert.ok(
    cookie,
    `Account ${label} session cookie missing`
  );

  console.log(
    `[SUCCESS] Account ${label} authenticated`
  );

  return cookie.split(";")[0];
}

// =====================================
// MAIN ADDRESS API TEST
// =====================================

async function runTests() {
  console.log("");
  console.log("================================");
  console.log("  THIKANAHUB ADDRESS API TEST");
  console.log("================================");

  let cookieA;
  let cookieB;

  let passed = 0;

  try {
    // Check Backend connection first
    await checkHealth();

    // Create two independent merchant accounts
    cookieA = await createTestAccount("A");
    cookieB = await createTestAccount("B");

    const endpoint =
      "/p14/address-resolutions";

    // =====================================
    // TEST 01: UNAUTHENTICATED SEARCH
    // =====================================

    console.log("\n[TEST 01] Unauthenticated search");

    const anonymous = await request(
      endpoint,
      {
        method: "POST",

        body: {
          address: "Kazipara, Dhaka",
        },
      }
    );

    assert.equal(
      anonymous.response.status,
      401
    );

    passed++;

    console.log(
      "[PASS] Unauthenticated search rejected"
    );

    // =====================================
    // TEST 02: INVALID ADDRESS INPUT
    // =====================================

    console.log("\n[TEST 02] Invalid address input");

    const invalid = await request(
      endpoint,
      {
        method: "POST",

        cookie: cookieA,

        body: {
          address: "",
        },
      }
    );

    assert.equal(
      invalid.response.status,
      400
    );

    passed++;

    console.log(
      "[PASS] Invalid address rejected"
    );

    // =====================================
    // TEST 03: MULTILINGUAL FUZZY MATCHING
    // =====================================

    console.log("\n[TEST 03] Multilingual fuzzy matching");

    const search = await request(
      endpoint,
      {
        method: "POST",

        cookie: cookieA,

        body: {
          address: "বাসা ১২, Kazipra, মিরপুর, Dhaka",
        },
      }
    );

    assert.equal(
      search.response.status,
      201
    );

    assert.equal(
      search.data.candidates?.[0]?.locality?.nameEn,
      "Kazipara"
    );

    assert.equal(
      search.data.candidates?.[0]?.matchType,
      "fuzzy"
    );

    passed++;

    console.log(
      "[PASS] Multilingual fuzzy matching"
    );

    console.log(
      "Matched locality:",
      search.data.candidates[0].locality.nameEn
    );

    console.log(
      "Matching score:",
      search.data.candidates[0].score
    );

    // =====================================
    // TEST 04: CONFIRMATION REQUIRED
    // =====================================

    console.log("\n[TEST 04] Confirmation required");

    assert.equal(
      search.data.requiresConfirmation,
      true
    );

    assert.equal(
      search.data.status,
      "needs_review"
    );

    const jobId = search.data.jobId;

    assert.match(
      jobId,
      /^[a-f0-9]{24}$/i
    );

    passed++;

    console.log(
      "[PASS] No automatic confirmation"
    );

    // =====================================
    // TEST 05: OWNER ACCESS
    // =====================================

    console.log("\n[TEST 05] Owner address access");

    const ownAddress = await request(
      `/jobs/${jobId}`,
      {
        cookie: cookieA,
      }
    );

    assert.equal(
      ownAddress.response.status,
      200
    );

    assert.equal(
      ownAddress.data.originalAddress,
      "বাসা ১২, Kazipra, মিরপুর, Dhaka"
    );

    passed++;

    console.log(
      "[PASS] Owner can read decrypted address"
    );

    // =====================================
    // TEST 06: CROSS-USER ACCESS PROTECTION
    // =====================================

    console.log("\n[TEST 06] Cross-user access");

    const unauthorized = await request(
      `/jobs/${jobId}`,
      {
        cookie: cookieB,
      }
    );

    assert.equal(
      unauthorized.response.status,
      404
    );

    assert.equal(
      unauthorized.data.originalAddress,
      undefined
    );

    passed++;

    console.log(
      "[PASS] Cross-user address access rejected"
    );

    // =====================================
    // TEST 07: UNKNOWN ADDRESS
    // =====================================

    console.log("\n[TEST 07] Unknown address");

    const unknown = await request(
      endpoint,
      {
        method: "POST",

        cookie: cookieA,

        body: {
          address: "Xyzqwv Unknown Place",
        },
      }
    );

    assert.equal(
      unknown.response.status,
      201
    );

    assert.equal(
      unknown.data.status,
      "no_confident_match"
    );

    assert.equal(
      unknown.data.candidates.length,
      0
    );

    passed++;

    console.log(
      "[PASS] Unknown address handled correctly"
    );

    // =====================================
    // FINAL TEST RESULT
    // =====================================

    console.log("");
    console.log("================================");
    console.log("       FINAL TEST RESULT");
    console.log("================================");
    console.log("Total Tests: 7");
    console.log("Passed:", passed);
    console.log("Failed: 0");
    console.log("================================");
    console.log("ALL 7 ADDRESS API TESTS PASSED");

  } catch (error) {
    console.error(
      `\n[TEST STOPPED] ${passed}/7 tests completed successfully`
    );

    throw error;

  } finally {

    // =====================================
    // CLEANUP TEST SESSIONS
    // =====================================

    console.log("\n[CLEANUP] Revoking test sessions...");

    const sessions = [cookieA, cookieB]
      .filter(Boolean);

    const results = await Promise.allSettled(
      sessions.map(cookie =>
        request("/auth/logout", {
          method: "POST",
          cookie,
        })
      )
    );

    const cleanupSuccessful = results.every(
      result =>
        result.status === "fulfilled" &&
        result.value.response.ok
    );

    if (sessions.length === 0) {
      console.log("[CLEANUP] No active test sessions");

    } else if (cleanupSuccessful) {
      console.log(
        "[SUCCESS] Test sessions revoked"
      );

    } else {
      console.warn(
        "[WARNING] Session cleanup could not be confirmed"
      );
    }
  }
}

// =====================================
// DETAILED ERROR DIAGNOSTICS
// =====================================

runTests().catch((error) => {
  console.error("");
  console.error("================================");
  console.error("       DETAILED TEST ERROR");
  console.error("================================");

  console.error(
    "Error Name:",
    error.name
  );

  console.error(
    "Error Message:",
    error.message
  );

  console.error(
    "Error Code:",
    error.code || "N/A"
  );

  console.error(
    "Cause Code:",
    error.cause?.code || "N/A"
  );

  console.error(
    "Cause Message:",
    error.cause?.message || "N/A"
  );

  if (error.code === "ERR_ASSERTION") {
    console.error(
      "Expected:",
      error.expected
    );

    console.error(
      "Actual:",
      error.actual
    );
  }

  console.error(
    "Stack Trace:",
    error.stack
  );

  console.error("================================");

  process.exitCode = 1;
});