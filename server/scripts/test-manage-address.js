import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const BASE = "http://127.0.0.1:5000/api/v1";
const ORIGIN = "http://localhost:3000";

const SEARCH = "/p14/address-resolutions";
const FEEDBACK = "/p14/address-feedback";
const MANAGE = "/p14/address-requests";
const HISTORY = "/p14/address-history";
const SAVED = "/p14/saved-addresses";

const sessions = [];
let passed = 0;

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

  const response = await fetch(BASE + endpoint, {
    method,

    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },

    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : {}),

    signal: AbortSignal.timeout(60000),
  });

  const data = await response.json();

  console.log(`[RESPONSE] HTTP ${response.status}`);

  if (!response.ok) {
    console.log("[API CODE]", data.code);
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

  return result.data;
}

function pass(message) {
  passed++;
  console.log(`[PASS ${passed}] ${message}`);
}

async function createMerchant(label) {
  const account = {
    name: `Management Test ${label}`,

    email:
      `manage-${randomBytes(8).toString("hex")}@example.com`,

    password: randomBytes(24).toString("hex"),
  };

  await expect(
    request("/auth/register", {
      method: "POST",
      body: account,
    }),
    201
  );

  const login = await request("/auth/login", {
    method: "POST",
    body: {
      email: account.email,
      password: account.password,
    },
  });

  assert.equal(login.response.status, 200);

  const raw = login.response.headers.get("set-cookie");

  assert.ok(raw);

  const cookie = raw.split(";")[0];

  sessions.push(cookie);

  return cookie;
}

function search(cookie, address) {
  return expect(
    request(SEARCH, {
      method: "POST",
      cookie,
      body: { address },
    }),
    201
  );
}

function confirm(cookie, jobId, localityId, revision) {
  return request(FEEDBACK, {
    method: "POST",
    cookie,
    body: {
      jobId,
      decision: "confirmed",
      localityId,
      revision,
    },
  });
}

function edit(cookie, jobId, address, revision) {
  return request(`${MANAGE}/${jobId}`, {
    method: "PATCH",
    cookie,
    body: { address, revision },
  });
}

function remove(cookie, jobId, revision) {
  return request(`${MANAGE}/${jobId}`, {
    method: "DELETE",
    cookie,
    body: { revision },
  });
}

function save(cookie, jobId, saved, revision) {
  return request(`${SAVED}/${jobId}`, {
    method: "PATCH",
    cookie,
    body: { saved, revision },
  });
}

function details(cookie, jobId) {
  return request(`/jobs/${jobId}`, { cookie });
}

async function runTests() {
  console.log("\nTHIKANAHUB ADDRESS MANAGEMENT TEST");

  try {
    const health = await expect(request("/health"), 200);

    assert.equal(health.status, "operational");

    const a = await createMerchant("A");
    const b = await createMerchant("B");

    const original = "Kazipara, Mirpur, Dhaka";
    const changed = "Shewrapara, Mirpur, Dhaka";

    const first = await search(a, original);
    const id = first.jobId;

    const oldCandidate = first.candidates.find(
      (c) => c.locality.nameEn === "Kazipara"
    );

    assert.ok(oldCandidate);

    await expect(
      confirm(a, id, oldCandidate.localityId, 0),
      200
    );

    await expect(save(a, id, true, 0), 200);

    const review = await search(
      a,
      "Xyzqwv Unknown Place"
    );

    await expect(
      request(FEEDBACK, {
        method: "POST",
        cookie: a,
        body: {
          jobId: review.jobId,
          decision: "no_correct_match",
          revision: 0,
        },
      }),
      200
    );

    // 01: Authentication
    await expect(edit(undefined, id, changed, 0), 401);
    await expect(remove(undefined, id, 0), 401);
    pass("Unauthenticated modifications rejected");

    // 02: Input validation
    await expect(edit(a, id, "", 0), 400);
    await expect(edit(a, "invalid-id", changed, 0), 400);
    await expect(remove(a, id, -1), 400);

    await expect(
      request(`${MANAGE}/${id}`, {
        method: "PATCH",
        cookie: a,
        body: {
          address: changed,
          revision: 0,
          ownerId: "another-user",
          status: "confirmed",
        },
      }),
      400
    );

    pass("Invalid and manipulated parameters rejected");

    // 03: Origin protection
    await expect(
      request(`${MANAGE}/${id}`, {
        method: "PATCH",
        cookie: a,
        origin: "https://untrusted.example",
        body: { address: changed, revision: 0 },
      }),
      403
    );

    await expect(
      request(`${MANAGE}/${id}`, {
        method: "DELETE",
        cookie: a,
        origin: "https://untrusted.example",
        body: { revision: 0 },
      }),
      403
    );

    pass("Untrusted origins rejected");

    // 04: Ownership
    await expect(edit(b, id, changed, 0), 404);
    await expect(remove(b, id, 0), 404);
    pass("Cross-user edit and delete rejected");

    // 05: Review lock
    await expect(
      edit(a, review.jobId, changed, 0),
      409,
      "REVIEW_LOCKED"
    );

    await expect(
      remove(a, review.jobId, 0),
      409,
      "REVIEW_LOCKED"
    );

    pass("Manual review records protected");

    // 06: Unchanged address
    await expect(
      edit(a, id, original, 0),
      400,
      "ADDRESS_UNCHANGED"
    );

    pass("Unchanged address rejected");

    // 07: Edit and re-resolution
    const edited = await expect(
      edit(a, id, changed, 0),
      200
    );

    assert.equal(edited.jobId, id);
    assert.equal(edited.originalAddress, changed);
    assert.equal(edited.revision, 1);
    assert.equal(edited.status, "needs_review");
    assert.equal(edited.decision, null);
    assert.equal(edited.selectedCandidate, null);
    assert.equal(edited.saved, false);
    assert.equal(edited.savedAt, null);
    assert.equal(edited.requiresConfirmation, true);

    const candidate = edited.candidates.find(
      (c) => c.locality.nameEn === "Shewrapara"
    );

    assert.ok(candidate);

    pass("Address edited and re-resolved");

    // 08: History synchronization
    const detail = await expect(details(a, id), 200);

    assert.equal(detail.originalAddress, changed);
    assert.equal(detail.revision, 1);
    assert.equal(detail.saved, false);
    assert.equal(detail.decision, null);
    assert.equal(detail.createdAt, first.createdAt);

    const history = await expect(
      request(HISTORY, { cookie: a }),
      200
    );

    const item = history.items.find(
      (i) => i.jobId === id
    );

    assert.equal(item?.originalAddress, changed);
    assert.equal(item?.revision, 1);
    assert.equal(item?.saved, false);

    const savedList = await expect(
      request(SAVED, { cookie: a }),
      200
    );

    assert.ok(
      savedList.items.every((i) => i.jobId !== id)
    );

    pass("Edited address synchronized with history");

    // 09: Stale edit and delete
    await expect(
      edit(a, id, original, 0),
      409,
      "REVISION_CONFLICT"
    );

    await expect(
      remove(a, id, 0),
      409,
      "REVISION_CONFLICT"
    );

    pass("Stale address modifications rejected");

    // 10: Stale feedback
    await expect(
      confirm(a, id, candidate.localityId, 0),
      409,
      "REVISION_CONFLICT"
    );

    await expect(
      confirm(a, id, candidate.localityId),
      409,
      "REVISION_CONFLICT"
    );

    pass("Stale and missing feedback revisions rejected");

    // 11: Old candidate
    await expect(
      confirm(a, id, oldCandidate.localityId, 1),
      400,
      "INVALID_CANDIDATE"
    );

    pass("Previous locality candidate rejected");

    const confirmed = await expect(
      confirm(a, id, candidate.localityId, 1),
      200
    );

    assert.equal(confirmed.status, "confirmed");

    assert.equal(
      confirmed.selectedCandidate.localityId,
      candidate.localityId
    );

    // 12: NEW — Stale bookmark protection
    await expect(
      save(a, id, true, 0),
      409,
      "REVISION_CONFLICT"
    );

    await expect(
      save(a, id, false, 0),
      409,
      "REVISION_CONFLICT"
    );

    pass("Stale save and unsave revisions rejected");

    // 13: NEW — Missing or invalid bookmark revision
    await expect(
      save(a, id, true),
      409,
      "REVISION_CONFLICT"
    );

    await expect(
      save(a, id, false),
      409,
      "REVISION_CONFLICT"
    );

    await expect(save(a, id, true, -1), 400);

    pass("Missing and invalid bookmark revisions rejected");

    // 14: Confirm and save edited address
    const resaved = await expect(
      save(a, id, true, 1),
      200
    );

    assert.equal(resaved.saved, true);
    assert.equal(resaved.revision, 1);

    const unsaved = await expect(
      save(a, id, false, 1),
      200
    );

    assert.equal(unsaved.saved, false);
    assert.equal(unsaved.savedAt, null);

    await expect(save(a, id, true, 1), 200);

    pass("Edited address confirmed and saved again");

    // 15: Delete
    const deleted = await expect(
      remove(a, id, 1),
      200
    );

    assert.equal(deleted.deleted, true);

    await expect(details(a, id), 404);

    for (const endpoint of [HISTORY, SAVED]) {
      const list = await expect(
        request(endpoint, { cookie: a }),
        200
      );

      assert.ok(
        list.items.every((i) => i.jobId !== id)
      );
    }

    await expect(remove(a, id, 1), 404);

    pass("Deleted address removed from all views");

    // 16: Unknown edited address
    const pending = await search(a, "Mirpur 10, Dhaka");

    const unknown = await expect(
      edit(a, pending.jobId, "Abcxyz Unknown Location", 0),
      200
    );

    assert.equal(unknown.status, "no_confident_match");
    assert.equal(unknown.candidates.length, 0);
    assert.equal(unknown.revision, 1);

    pass("Unknown edited address handled correctly");

    // 17: Concurrent edit
    const concurrent = await Promise.all([
      edit(a, pending.jobId, original, 1),
      edit(a, pending.jobId, changed, 1),
    ]);

    assert.deepEqual(
      concurrent
        .map((r) => r.response.status)
        .sort((x, y) => x - y),
      [200, 409]
    );

    const final = await expect(
      details(a, pending.jobId),
      200
    );

    assert.equal(final.revision, 2);

    pass("Concurrent address modifications protected");

    console.log("\n================================");
    console.log("FINAL TEST RESULT");
    console.log("Total Tests: 17");
    console.log("Passed:", passed);
    console.log("Failed: 0");
    console.log("ALL 17 ADDRESS MANAGEMENT TESTS PASSED");
    console.log("================================");

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

    const success = cleanup.every(
      (r) =>
        r.status === "fulfilled" &&
        r.value.response.ok
    );

    console.log(
      success
        ? "[SUCCESS] Test sessions revoked"
        : "[WARNING] Session cleanup incomplete"
    );
  }
}

runTests().catch((error) => {
  console.error("\nADDRESS MANAGEMENT TEST ERROR");
  console.error("Passed:", passed);
  console.error("Message:", error.message);
  console.error("Cause:", error.cause?.code || "N/A");
  console.error(error.stack);

  process.exitCode = 1;
});