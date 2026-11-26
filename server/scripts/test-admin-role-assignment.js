import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { ObjectId } from "mongodb";
import { env } from "../src/config/env.js";
import { connectDatabases, closeDatabases, getMainDB, getAuditDB } from "../src/config/database.js";
import { createSession } from "../src/utils/session.js";

const API = "http://127.0.0.1:5000/api/v1";
const ORIGIN = "http://localhost:3000";
const BASE = "/p14/admin/users";
const labels = ["merchant", "reviewer", "manager", "admin"];
const markers = [randomBytes(8).toString("hex"), randomBytes(8).toString("hex")];
const sets = markers.map(marker => Object.fromEntries(labels.map(label => [label, {
  email: `dm-browser-${label}-${marker}@example.com`,
  password: randomBytes(24).toString("hex"),
}])));
const started = [];
let connected = false;
let passed = 0;
let admin;

function cli(script, args, input) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(), input, encoding: "utf8", timeout: 90000,
    windowsHide: true, maxBuffer: 1024 * 1024,
    env: { ...process.env, THIKANAHUB_BROWSER_FIXTURES: "1" },
  });
  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.error || result.status !== 0) {
    throw new Error(`CLI failed: ${script} (${result.error?.code ?? result.status})`);
  }
}

async function api(path, { method = "GET", cookie, body, origin = ORIGIN, expected = 200 } = {}) {
  const headers = { Accept: "application/json", Connection: "close", Origin: origin };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response, data;
  try {
    response = await fetch(API + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60000), redirect: "error",
    });
    data = await response.json();
  } catch (error) {
    console.error("[HTTP ERROR]", method, path, error.name, error.cause?.code ?? "Unavailable");
    throw error;
  }
  console.log(`[API] ${method} ${path} -> ${response.status}`);
  assert.ok([].concat(expected).includes(response.status), `${path}: HTTP ${response.status} ${data.code ?? ""}`);
  assert.equal(data.success, response.ok);
  if (path.startsWith(BASE)) assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  return { data, response };
}

async function login(account, role = "merchant") {
  const { data, response } = await api("/auth/login", { method: "POST", body: account });
  assert.equal(data.user.role, role);
  assert.match(data.user.id, /^[a-f0-9]{24}$/i);
  const header = response.headers.getSetCookie().find(value => value.startsWith("thikanahub_session="));
  assert.ok(header);
  assert.match(header, /;\s*HttpOnly(?:;|$)/i);
  return { id: data.user.id, cookie: header.split(";")[0] };
}

async function finishBoth(promises) {
  const settled = await Promise.allSettled(promises);
  const failure = settled.find(item => item.status === "rejected");
  if (failure) throw failure.reason;
  return settled.map(item => item.value);
}

function assign(id, role, options = {}) {
  return api(`${BASE}/${id}/role`, { method: "POST", cookie: admin.cookie, body: { role }, ...options });
}

function assertRoleResponse(result, id, role) {
  assert.equal(result.data.userId, id);
  assert.equal(result.data.previousRole, "merchant");
  assert.equal(result.data.role, role);
  assert.equal(result.data.auditRecorded, true);
  assert.ok(Number.isSafeInteger(result.data.revokedSessions) && result.data.revokedSessions >= 0);
  assert.ok(Number.isFinite(Date.parse(result.data.updatedAt)));
  assert.deepEqual(Object.keys(result.data).sort(), ["success", "userId", "previousRole", "role", "revokedSessions", "updatedAt", "auditRecorded", "message"].sort());
}

async function group(title, action) {
  await action();
  console.log(`\n[PASS ${++passed}/8] ${title}\n`);
}

const userDoc = id => getMainDB().collection("users").findOne({ _id: new ObjectId(id) }, { projection: { role: 1, status: 1, securityVersion: 1 } });
const addressCount = id => getMainDB().collection("address_requests").countDocuments({ ownerId: new ObjectId(id) });
const sessionCount = id => getMainDB().collection("sessions").countDocuments({ userId: new ObjectId(id) });
const verifyRevoked = cookie => api("/auth/me", { cookie, expected: 401 });

async function run() {
  assert.equal(process.env.NODE_ENV, "development");
  assert.equal(env.CLIENT_URL, ORIGIN);
  console.log("TEST FIXTURE MARKERS:", markers.join(" "));
  const [a, b] = sets;
  let owner, reviewer, reviewerOther, manager, raceAddress, raceRole, inactive;
  try {
    await group("Authorization, trusted origin and strict role input", async () => {
      await api("/health");
      for (let i = 0; i < sets.length; i++) {
        started.push(markers[i]);
        cli("scripts/create-data-manager-browser-fixtures.js", [markers[i]], JSON.stringify(Object.fromEntries(labels.map(label => [label, sets[i][label].password]))));
      }
      cli("scripts/admin-provision.js", ["provision", a.admin.email]);
      await api("/health");
      admin = await login(a.admin, "admin");
      owner = await login(a.merchant);
      reviewer = await login(a.reviewer);
      reviewerOther = await login(a.reviewer);
      manager = await login(a.manager);
      raceAddress = await login(b.merchant);
      raceRole = await login(b.reviewer);
      inactive = await login(b.manager);
      await assign(reviewer.id, "reviewer", { cookie: undefined, expected: 401 });
      await assign(reviewer.id, "reviewer", { cookie: owner.cookie, expected: 403 });
      await assign(reviewer.id, "reviewer", { origin: "https://untrusted.example.com", expected: 403 });
      await assign(reviewer.id, "admin", { expected: 400 });
      await assign(reviewer.id, "reviewer", { body: { role: "reviewer", status: "active" }, expected: 400 });
      await assign("invalid-id", "reviewer", { expected: 400 });
      await api(`${BASE}/${reviewer.id}/role?force=true`, { method: "POST", cookie: admin.cookie, body: { role: "reviewer" }, expected: 400 });
      await assign(admin.id, "reviewer", { expected: 403 });
      await assign(randomBytes(12).toString("hex"), "reviewer", { expected: 404 });
      connected = true;
      await connectDatabases();
      assert.equal((await userDoc(reviewer.id)).role, "merchant");
    });

    await group("Reviewer promotion and all previous sessions revoked", async () => {
      const result = await assign(reviewer.id, "reviewer");
      assertRoleResponse(result, reviewer.id, "reviewer");
      assert.ok(result.data.revokedSessions >= 2);
      assert.equal(await sessionCount(reviewer.id), 0);
      await verifyRevoked(reviewer.cookie);
      await verifyRevoked(reviewerOther.cookie);
      const fresh = await login(a.reviewer, "reviewer");
      await api("/p14/reviewer/statistics", { cookie: fresh.cookie });
      await api("/p14/address-resolutions", { method: "POST", cookie: fresh.cookie, body: { address: "House 12, Kazipara, Mirpur, Dhaka" }, expected: 403 });
      await assign(manager.id, "reviewer", { cookie: fresh.cookie, expected: 403 });
      const doc = await userDoc(reviewer.id);
      assert.equal(doc.role, "reviewer");
      assert.match(doc.securityVersion, /^[a-f0-9-]{36}$/i);
    });

    await group("Data Manager promotion and role isolation", async () => {
      const result = await assign(manager.id, "data_manager");
      assertRoleResponse(result, manager.id, "data_manager");
      assert.equal(await sessionCount(manager.id), 0);
      await verifyRevoked(manager.cookie);
      const fresh = await login(a.manager, "data_manager");
      await api("/p14/data-manager/dashboard", { cookie: fresh.cookie });
      await assign(raceRole.id, "reviewer", { cookie: fresh.cookie, expected: 403 });
      assert.equal((await userDoc(manager.id)).role, "data_manager");
    });

    await group("Ownership, inactive account and repeat promotion protection", async () => {
      const created = await api("/p14/address-resolutions", { method: "POST", cookie: owner.cookie, body: { address: `House 12, Kazipara, Mirpur, Dhaka ${markers[0]}` }, expected: 201 });
      const denied = await assign(owner.id, "reviewer", { expected: 409 });
      assert.equal(denied.data.code, "ACCOUNT_HAS_ADDRESS_RECORDS");
      assert.equal((await userDoc(owner.id)).role, "merchant");
      assert.equal(await addressCount(owner.id), 1);
      await api(`/jobs/${created.data.jobId}`, { cookie: owner.cookie });
      // Only modify the exact synthetic account created by this test.
      const update = await getMainDB().collection("users").updateOne({ _id: new ObjectId(inactive.id), email: b.manager.email, name: "DM Browser Test manager", role: "merchant", status: "active" }, { $set: { status: "suspended" } });
      assert.equal(update.modifiedCount, 1);
      const blocked = await assign(inactive.id, "data_manager", { expected: 409 });
      assert.equal(blocked.data.code, "ACCOUNT_NOT_ELIGIBLE");
      await assign(reviewer.id, "data_manager", { expected: 409 });
      assert.equal((await userDoc(reviewer.id)).role, "reviewer");
    });

    await group("Concurrent conflicting role assignments", async () => {
      const results = await finishBoth([
        assign(raceRole.id, "reviewer", { expected: [200, 409] }),
        assign(raceRole.id, "data_manager", { expected: [200, 409] }),
      ]);
      assert.deepEqual(results.map(r => r.response.status).sort(), [200, 409]);
      const winner = results.find(r => r.response.ok);
      assertRoleResponse(winner, raceRole.id, winner.data.role);
      assert.equal((await userDoc(raceRole.id)).role, winner.data.role);
      await verifyRevoked(raceRole.cookie);
    });

    await group("Concurrent address creation and role change invariant", async () => {
      const [address, role] = await finishBoth([
        api("/p14/address-resolutions", { method: "POST", cookie: raceAddress.cookie, body: { address: `House 14, Kazipara, Mirpur, Dhaka ${markers[1]}` }, expected: [201, 401, 403, 409] }),
        assign(raceAddress.id, "reviewer", { expected: [200, 409] }),
      ]);
      const doc = await userDoc(raceAddress.id);
      if (role.response.ok) {
        assertRoleResponse(role, raceAddress.id, "reviewer");
        assert.equal(doc.role, "reviewer");
        assert.equal(await addressCount(raceAddress.id), 0);
        assert.ok([401, 403, 409].includes(address.response.status));
        await verifyRevoked(raceAddress.cookie);
      } else {
        assert.equal(address.response.status, 201);
        assert.equal(role.data.code, "ACCOUNT_HAS_ADDRESS_RECORDS");
        assert.equal(doc.role, "merchant");
        assert.equal(await addressCount(raceAddress.id), 1);
      }
      console.log("[PASS] No promoted account owns a concurrently created address.");
    });

    await group("Stale-session version rejection and persisted administrative audit", async () => {
      // Simulate a session insert using a pre-promotion login snapshot.
      const stale = await createSession(new ObjectId(reviewer.id), null, "merchant");
      await verifyRevoked(`thikanahub_session=${stale.token}`);
      assert.equal(await getMainDB().collection("sessions").countDocuments({ _id: stale.tokenHash }), 0);
      // Matching current role alone is insufficient: old security version must fail.
      const staleVersion = await createSession(new ObjectId(reviewer.id), null, "reviewer");
      await verifyRevoked(`thikanahub_session=${staleVersion.token}`);
      assert.equal(await getMainDB().collection("sessions").countDocuments({ _id: staleVersion.tokenHash }), 0);
      const events = getAuditDB().collection("audit_events");
      for (const [target, action] of [[reviewer, "ADMIN_ROLE_ASSIGN_REVIEWER"], [manager, "ADMIN_ROLE_ASSIGN_DATA_MANAGER"]]) {
        for (const result of ["started", "success"]) {
          const event = await events.findOne({ userId: new ObjectId(admin.id), targetId: new ObjectId(target.id), action, result });
          assert.ok(event, `Missing audit: ${action} / ${result}`);
        }
      }
      assert.equal(await events.countDocuments({ userId: new ObjectId(admin.id), targetId: new ObjectId(raceRole.id), action: { $in: ["ADMIN_ROLE_ASSIGN_REVIEWER", "ADMIN_ROLE_ASSIGN_DATA_MANAGER"] }, result: "success" }), 1);
      assert.ok(await events.findOne({ userId: new ObjectId(admin.id), targetId: new ObjectId(owner.id), action: "ADMIN_ROLE_ASSIGN_REVIEWER", result: "denied" }));
    });

    await group("Existing Admin APIs and logout regression", async () => {
      await api(BASE + "?limit=2", { cookie: admin.cookie });
      await api("/p14/admin/access", { cookie: admin.cookie });
      await api("/p14/admin/statistics", { cookie: admin.cookie });
      await api("/p14/admin/dataset-proposals/locality", { cookie: admin.cookie });
      await api("/auth/logout", { method: "POST", cookie: admin.cookie });
      await assign(raceRole.id, "reviewer", { expected: 401 });
      await api(BASE, { cookie: admin.cookie, expected: 401 });
    });
  } finally {
    try {
      if (connected) await closeDatabases();
    } finally {
      for (const marker of started) {
        try { cli("scripts/cleanup-data-manager-browser.js", [marker]); }
        catch { console.error("[CLEANUP FAILED]", marker); process.exitCode = 1; }
      }
    }
  }
  assert.equal(passed, 8);
  assert.ok(!process.exitCode, "Cleanup failed.");
  console.log("\n================================\nFINAL ADMIN ROLE ASSIGNMENT RESULT\nTotal Test Groups: 8\nPassed: 8\nFailed: 0\nALL 8 ADMIN ROLE ASSIGNMENT TEST GROUPS PASSED\n================================");
}
run().catch(error => {
  console.error(`[FAILED] Completed groups: ${passed}/8`);
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
