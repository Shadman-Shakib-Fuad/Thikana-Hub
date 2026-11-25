import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  connectDatabases,
  closeDatabases,
  getMainDB,
} from "../src/config/database.js";

import {
  provisionDataManager,
} from "../src/services/data-manager-admin.service.js";

const API = "http://127.0.0.1:5000/api/v1";

const BASE = "/p14/data-manager";

const marker = randomBytes(8).toString("hex");

const createdEmails = [];

const localityIds = [
  `BD-TEST-DASH-A-${marker.toUpperCase()}`,
  `BD-TEST-DASH-B-${marker.toUpperCase()}`,
];

let passed = 0;
let connected = false;

async function api(endpoint, {
  method = "GET",
  cookie,
  body,
  expected = 200,
} = {}) {
  const response = await fetch(API + endpoint, {
    method,
    headers: {
      Accept: "application/json",
      Origin: "http://localhost:3000",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45000),
  });

  const result = await response.json();

  console.log(
    `[API] ${method} ${endpoint} -> ${response.status}`
  );

  assert.equal(
    response.status,
    expected,
    result.code ?? result.message
  );

  if (response.ok) {
    assert.equal(result.success, true);
  }

  return { result, response };
}

async function createAccount(label, manager = false) {
  const user = {
    name: `Dashboard Test ${label}`,
    email: `dashboard-${label}-${marker}@example.com`,
    password: randomBytes(24).toString("hex"),
  };

  await api("/auth/register", {
    method: "POST",
    body: user,
    expected: 201,
  });

  createdEmails.push(user.email);

  if (manager) {
    await provisionDataManager(user.email);
  }

  const { response } = await api("/auth/login", {
    method: "POST",
    body: {
      email: user.email,
      password: user.password,
    },
  });

  const match = (
    response.headers.get("set-cookie") ?? ""
  ).match(
    /(?:^|,\s*)(thikanahub_session=[^;,\s]+)/
  );

  assert.ok(match);

  return match[1];
}

async function createProposal(cookie, localityId) {
  return api(`${BASE}/locality-proposals`, {
    method: "POST",
    cookie,
    expected: 201,
    body: {
      operation: "create",
      localityId,

      locality: {
        nameEn: "Synthetic Test Locality",
        nameBn: "পরীক্ষামূলক এলাকা",
        areaEn: "Synthetic Area",
        areaBn: "পরীক্ষামূলক অঞ্চল",
        districtEn: "Synthetic District",
        districtBn: "পরীক্ষামূলক জেলা",
        divisionEn: "Synthetic Division",
        divisionBn: "পরীক্ষামূলক বিভাগ",
      },

      reason: "Synthetic dashboard integration test.",
      evidence: "Synthetic test only.",
    },
  });
}

async function group(name, action) {
  await action();
  passed++;
  console.log(`\n[PASS ${passed}/4] ${name}\n`);
}

async function run() {
  assert.equal(process.env.NODE_ENV, "development");

  try {
    await connectDatabases();
    connected = true;

    const db = getMainDB();

    let merchant;
    let managerA;
    let managerB;

    await group("Authentication and role isolation", async () => {
      await api("/health");

      await api(`${BASE}/dashboard`, {
        expected: 401,
      });

      merchant = await createAccount("merchant");

      await api(`${BASE}/dashboard`, {
        cookie: merchant,
        expected: 403,
      });

      managerA = await createAccount("manager-a", true);
      managerB = await createAccount("manager-b", true);

      await api(`${BASE}/dashboard?unexpected=true`, {
        cookie: managerA,
        expected: 400,
      });
    });

    await group("Accurate live database statistics", async () => {
      const { result, response } = await api(
        `${BASE}/dashboard`,
        { cookie: managerA }
      );

      const localities = db.collection("localities");

      assert.equal(
        result.summary.totalLocalities,
        await localities.countDocuments({})
      );

      assert.equal(
        result.summary.approvedLocalities,
        await localities.countDocuments({ approved: true })
      );

      assert.equal(
        result.summary.totalEscalated,
        await db.collection("address_requests").countDocuments({
          decision: "review_requested",
          "reviewAssignment.status": "escalated",
        })
      );

      assert.equal(result.summary.proposals.total, 0);

      assert.deepEqual(result.recentProposals, []);

      assert.equal(
        response.headers.get("cache-control"),
        "no-store"
      );
    });

    await group("Proposal counts and owner privacy", async () => {
      const first = await createProposal(
        managerA,
        localityIds[0]
      );

      const second = await createProposal(
        managerB,
        localityIds[1]
      );

      const a = await api(`${BASE}/dashboard`, {
        cookie: managerA,
      });

      const b = await api(`${BASE}/dashboard`, {
        cookie: managerB,
      });

      for (const [response, proposal] of [
        [a.result, first.result.item],
        [b.result, second.result.item],
      ]) {
        assert.deepEqual(response.summary.proposals, {
          pending: 1,
          approved: 0,
          rejected: 0,
          total: 1,
        });

        assert.equal(response.recentProposals.length, 1);

        assert.equal(
          response.recentProposals[0].proposalId,
          proposal.proposalId
        );

        assert.equal(
          response.recentProposals[0].evidence,
          undefined
        );

        assert.equal(
          response.recentProposals[0].requestedBy,
          undefined
        );
      }

      assert.equal(
        await db.collection("localities").countDocuments({
          id: { $in: localityIds },
        }),
        0
      );
    });

    await group("Logout and session protection", async () => {
      await api("/auth/logout", {
        method: "POST",
        cookie: managerA,
      });

      await api(`${BASE}/dashboard`, {
        cookie: managerA,
        expected: 401,
      });
    });

  } finally {
    try {
      if (connected) {
        const db = getMainDB();

        const accounts = await db.collection("users")
          .find({
            email: { $in: createdEmails },
          })
          .project({ _id: 1 })
          .toArray();

        const ids = accounts.map(user => user._id);

        await db.collection("locality_proposals").deleteMany({
          localityId: { $in: localityIds },
          requestedBy: { $in: ids },
          status: "pending",
        });

        await db.collection("sessions").deleteMany({
          userId: { $in: ids },
        });

        console.log("[CLEANUP] Test proposals and sessions removed.");
      }
    } finally {
      await closeDatabases();
    }
  }

  console.log("\n==============================");
  console.log("FINAL DASHBOARD API RESULT");
  console.log("Passed:", passed);
  console.log("Failed: 0");
  console.log("ALL 4 DASHBOARD TEST GROUPS PASSED");
  console.log("==============================\n");
}

run().catch(error => {
  console.error(`[FAILED] Completed groups: ${passed}/4`);
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
