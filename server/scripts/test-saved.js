import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const BASE = "http://127.0.0.1:5000/api/v1";

const ORIGIN = "http://localhost:3000";

const SAVED = "/p14/saved-addresses";

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

  console.log(
    `[PASS ${passed}] ${message}`
  );
}

// =====================================
// CREATE TEST MERCHANT
// =====================================

async function createMerchant(label) {
  const account = {
    name: `Saved Address Test ${label}`,

    email:
      `saved-${randomBytes(8).toString("hex")}@example.com`,

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
// CREATE ADDRESS
// =====================================

async function createAddress(
  cookie,
  address,
  confirm = false
) {
  const result = await request(
    "/p14/address-resolutions",
    {
      method: "POST",
      cookie,
      body: { address },
    }
  );

  expectStatus(result, 201);

  const job = result.data;

  if (confirm) {
    const localityId =
      job.candidates[0]?.localityId;

    assert.ok(localityId);

    const feedback = await request(
      "/p14/address-feedback",
      {
        method: "POST",
        cookie,

        body: {
          jobId: job.jobId,
          decision: "confirmed",
          localityId,
        },
      }
    );

    expectStatus(feedback, 200);
  }

  return job;
}

// =====================================
// SAVE OR UNSAVE HELPER
// =====================================

function saveAddress(
  cookie,
  jobId,
  saved
) {
  return request(
    `${SAVED}/${jobId}`,
    {
      method: "PATCH",
      cookie,
      body: { saved },
    }
  );
}

// =====================================
// MAIN TESTS
// =====================================

async function runTests() {
  console.log("");
  console.log("================================");
  console.log(" THIKANAHUB SAVED ADDRESS TEST");
  console.log("================================");

  try {
    const health = await request("/health");

    expectStatus(health, 200);

    assert.equal(
      health.data.status,
      "operational"
    );

    // Prepare isolated test merchants
    const cookieA = await createMerchant("A");
    const cookieB = await createMerchant("B");

    const addressA = await createAddress(
      cookieA,
      "Kazipara, Mirpur, Dhaka",
      true
    );

    const secondA = await createAddress(
      cookieA,
      "Shewrapara, Mirpur, Dhaka",
      true
    );

    const pendingA = await createAddress(
      cookieA,
      "Mirpur 10, Dhaka"
    );

    const addressB = await createAddress(
      cookieB,
      "Shewrapara, Mirpur, Dhaka",
      true
    );

    // =====================================
    // TEST 01: AUTHENTICATION
    // =====================================

    const anonymousSave = await saveAddress(
      undefined,
      addressA.jobId,
      true
    );

    expectStatus(anonymousSave, 401);

    const anonymousList = await request(SAVED);

    expectStatus(anonymousList, 401);

    pass("Unauthenticated access rejected");

    // =====================================
    // TEST 02: STRICT INPUT VALIDATION
    // =====================================

    const invalid = await request(
      `${SAVED}/${addressA.jobId}`,
      {
        method: "PATCH",
        cookie: cookieA,

        body: {
          saved: "true",
        },
      }
    );

    expectStatus(invalid, 400);

    const manipulated = await request(
      `${SAVED}/${addressA.jobId}`,
      {
        method: "PATCH",
        cookie: cookieA,

        body: {
          saved: true,
          ownerId: "another-user",
        },
      }
    );

    expectStatus(manipulated, 400);

    const invalidId = await saveAddress(
      cookieA,
      "invalid-id",
      true
    );

    expectStatus(invalidId, 400);

    pass("Invalid parameters rejected");

    // =====================================
    // TEST 03: ORIGIN PROTECTION
    // =====================================

    const originTest = await request(
      `${SAVED}/${addressA.jobId}`,
      {
        method: "PATCH",
        cookie: cookieA,
        origin: "https://untrusted.example",
        body: { saved: true },
      }
    );

    expectStatus(originTest, 403);

    pass("Untrusted origin rejected");

    // =====================================
    // TEST 04: OWNERSHIP PROTECTION
    // =====================================

    const crossUser = await saveAddress(
      cookieB,
      addressA.jobId,
      true
    );

    expectStatus(crossUser, 404);

    pass("Cross-user save rejected");

    // =====================================
    // TEST 05: CONFIRMED-ONLY POLICY
    // =====================================

    const pendingSave = await saveAddress(
      cookieA,
      pendingA.jobId,
      true
    );

    expectStatus(pendingSave, 409);

    assert.equal(
      pendingSave.data.code,
      "ADDRESS_NOT_CONFIRMED"
    );

    pass("Unconfirmed address save rejected");

    // =====================================
    // TEST 06: VALID SAVE
    // =====================================

    const saved = await saveAddress(
      cookieA,
      addressA.jobId,
      true
    );

    expectStatus(saved, 200);

    assert.equal(saved.data.saved, true);

    assert.ok(saved.data.savedAt);

    pass("Confirmed address saved");

    // =====================================
    // TEST 07: REPEATED SAVE
    // =====================================

    const duplicate = await saveAddress(
      cookieA,
      addressA.jobId,
      true
    );

    expectStatus(duplicate, 200);

    assert.equal(duplicate.data.saved, true);

    assert.equal(
      duplicate.data.savedAt,
      saved.data.savedAt
    );

    const list = await request(
      SAVED,
      { cookie: cookieA }
    );

    expectStatus(list, 200);

    assert.equal(list.data.items.length, 1);

    pass("Repeated save does not duplicate records");

    // =====================================
    // TEST 08: SAVED ADDRESS ISOLATION
    // =====================================

    const saveSecond = await saveAddress(
      cookieA,
      secondA.jobId,
      true
    );

    expectStatus(saveSecond, 200);

    const saveOther = await saveAddress(
      cookieB,
      addressB.jobId,
      true
    );

    expectStatus(saveOther, 200);

    const listA = await request(
      SAVED,
      { cookie: cookieA }
    );

    const listB = await request(
      SAVED,
      { cookie: cookieB }
    );

    expectStatus(listA, 200);
    expectStatus(listB, 200);

    assert.equal(listA.data.items.length, 2);
    assert.equal(listB.data.items.length, 1);

    assert.ok(
      listA.data.items.every(
        (item) => item.jobId !== addressB.jobId
      )
    );

    assert.equal(
      listB.data.items[0].jobId,
      addressB.jobId
    );

    assert.ok(
      listA.data.items.some(
        (item) =>
          item.originalAddress ===
          "Kazipara, Mirpur, Dhaka"
      )
    );

    pass("Saved addresses are isolated by owner");

    // =====================================
    // TEST 09: PAGINATION
    // =====================================

    const page1 = await request(
      `${SAVED}?limit=1`,
      { cookie: cookieA }
    );

    expectStatus(page1, 200);

    assert.equal(page1.data.items.length, 1);

    assert.equal(
      page1.data.pagination.hasMore,
      true
    );

    const cursor =
      page1.data.pagination.nextCursor;

    assert.ok(cursor);

    const page2 = await request(
      `${SAVED}?limit=1&cursor=${encodeURIComponent(cursor)}`,
      { cookie: cookieA }
    );

    expectStatus(page2, 200);

    assert.equal(page2.data.items.length, 1);

    assert.notEqual(
      page1.data.items[0].jobId,
      page2.data.items[0].jobId
    );

    assert.equal(
      page2.data.pagination.hasMore,
      false
    );

    pass("Saved address pagination works");

    // =====================================
    // TEST 10: HISTORY AND DETAILS SYNC
    // =====================================

    const details = await request(
      `/jobs/${addressA.jobId}`,
      { cookie: cookieA }
    );

    expectStatus(details, 200);

    assert.equal(details.data.saved, true);

    const history = await request(
      HISTORY,
      { cookie: cookieA }
    );

    expectStatus(history, 200);

    const historyItem = history.data.items.find(
      (item) => item.jobId === addressA.jobId
    );

    assert.equal(historyItem?.saved, true);

    pass("Saved status synchronized with history");

    // =====================================
    // TEST 11: UNSAVE WITHOUT DELETION
    // =====================================

    const deniedUnsave = await saveAddress(
      cookieB,
      addressA.jobId,
      false
    );

    expectStatus(deniedUnsave, 404);

    const unsaved = await saveAddress(
      cookieA,
      addressA.jobId,
      false
    );

    expectStatus(unsaved, 200);

    assert.equal(unsaved.data.saved, false);
    assert.equal(unsaved.data.savedAt, null);

    const remaining = await request(
      SAVED,
      { cookie: cookieA }
    );

    expectStatus(remaining, 200);

    assert.equal(remaining.data.items.length, 1);

    assert.equal(
      remaining.data.items[0].jobId,
      secondA.jobId
    );

    const original = await request(
      `/jobs/${addressA.jobId}`,
      { cookie: cookieA }
    );

    expectStatus(original, 200);

    assert.equal(original.data.saved, false);

    assert.equal(
      original.data.originalAddress,
      "Kazipara, Mirpur, Dhaka"
    );

    assert.equal(
      original.data.status,
      "confirmed"
    );

    const remainingHistory = await request(
      HISTORY,
      { cookie: cookieA }
    );

    expectStatus(remainingHistory, 200);

    assert.equal(
      remainingHistory.data.items.length,
      3
    );

    pass("Unsave preserves original address history");

    // =====================================
    // TEST 12: PAGINATION VALIDATION
    // =====================================

    const invalidLimit = await request(
      `${SAVED}?limit=10000`,
      { cookie: cookieA }
    );

    expectStatus(invalidLimit, 400);

    const invalidCursor = await request(
      `${SAVED}?cursor=invalid`,
      { cookie: cookieA }
    );

    expectStatus(invalidCursor, 400);

    const invalidOwner = await request(
      `${SAVED}?ownerId=another-user`,
      { cookie: cookieA }
    );

    expectStatus(invalidOwner, 400);

    pass("Saved address query validation works");

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
    console.log("ALL 12 SAVED ADDRESS TESTS PASSED");

  } finally {
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

runTests().catch((error) => {
  console.error("");
  console.error("================================");
  console.error("       SAVED ADDRESS TEST ERROR");
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