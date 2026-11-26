import {
  getMainDB,
  getAuditDB,
} from "../config/database.js";

const QUERY_TIMEOUT = 10000;

const DAY_MS =
  24 * 60 * 60 * 1000;

// =====================================
// AGGREGATION HELPERS
// =====================================

function eq(field, value) {
  return {
    $eq: [`$${field}`, value],
  };
}

function and(...conditions) {
  return {
    $and: conditions,
  };
}

function sumIf(condition) {
  return {
    $sum: {
      $cond: [condition, 1, 0],
    },
  };
}

function createdWithin(from, to) {
  return {
    $and: [
      {
        $eq: [
          { $type: "$createdAt" },
          "date",
        ],
      },
      {
        $gte: ["$createdAt", from],
      },
      {
        $lte: ["$createdAt", to],
      },
    ],
  };
}

// Return only numerical aggregate results.
// No individual documents are returned.

async function summarize(
  collection,
  conditions
) {
  const group = {
    _id: null,
    total: { $sum: 1 },
  };

  const empty = {
    total: 0,
  };

  for (
    const [key, condition]
    of Object.entries(conditions)
  ) {
    group[key] = sumIf(condition);
    empty[key] = 0;
  }

  const [result] = await collection
    .aggregate(
      [
        { $group: group },
        {
          $project: {
            _id: 0,
          },
        },
      ],
      {
        maxTimeMS: QUERY_TIMEOUT,
      }
    )
    .toArray();

  return result ?? empty;
}

// =====================================
// USER STATISTICS
// =====================================

async function userStatistics(
  db,
  from,
  to
) {
  const result = await summarize(
    db.collection("users"),

    {
      active: eq("status", "active"),

      suspended: eq(
        "status",
        "suspended"
      ),

      merchant: eq(
        "role",
        "merchant"
      ),

      reviewer: eq(
        "role",
        "reviewer"
      ),

      dataManager: eq(
        "role",
        "data_manager"
      ),

      admin: eq(
        "role",
        "admin"
      ),

      recent: createdWithin(
        from,
        to
      ),
    }
  );

  return {
    total: result.total,

    active: result.active,

    suspended: result.suspended,

    otherStatus:
      result.total -
      result.active -
      result.suspended,

    byRole: {
      merchant: result.merchant,

      reviewer: result.reviewer,

      dataManager: result.dataManager,

      admin: result.admin,

      other:
        result.total -
        result.merchant -
        result.reviewer -
        result.dataManager -
        result.admin,
    },

    recent: result.recent,
  };
}

// =====================================
// ADDRESS & REVIEW STATISTICS
// =====================================

async function addressStatistics(
  db,
  from,
  to
) {
  const reviewRequested = eq(
    "decision",
    "review_requested"
  );

  const reviewStatus = status =>
    and(
      reviewRequested,

      eq(
        "reviewAssignment.status",
        status
      )
    );

  const awaitingAssignment = and(
    reviewRequested,

    {
      $in: [
        {
          $ifNull: [
            "$reviewAssignment.status",
            null,
          ],
        },

        [null, "unassigned"],
      ],
    }
  );

  const result = await summarize(
    db.collection("address_requests"),

    {
      confirmed: eq(
        "decision",
        "confirmed"
      ),

      saved: eq("saved", true),

      reviewRequested,

      awaitingAssignment,

      pending: reviewStatus(
        "pending"
      ),

      escalated: reviewStatus(
        "escalated"
      ),

      resolved: reviewStatus(
        "resolved"
      ),

      recent: createdWithin(
        from,
        to
      ),
    }
  );

  return {
    total: result.total,

    confirmed: result.confirmed,

    unresolved:
      result.total -
      result.confirmed,

    saved: result.saved,

    confirmationRate:
      result.total === 0
        ? 0
        : Number(
            (
              result.confirmed /
              result.total *
              100
            ).toFixed(2)
          ),

    reviews: {
      totalRequested:
        result.reviewRequested,

      awaitingAssignment:
        result.awaitingAssignment,

      pending: result.pending,

      escalated: result.escalated,

      awaitingMerchantConfirmation:
        result.resolved,

      other:
        result.reviewRequested -
        result.awaitingAssignment -
        result.pending -
        result.escalated -
        result.resolved,
    },

    recent: result.recent,
  };
}

// =====================================
// DATASET STATISTICS
// =====================================

async function localityStatistics(db) {
  const result = await summarize(
    db.collection("localities"),

    {
      approved: eq(
        "approved",
        true
      ),
    }
  );

  return {
    total: result.total,

    approved: result.approved,

    notApproved:
      result.total -
      result.approved,
  };
}

// =====================================
// PROPOSAL STATISTICS
// =====================================

async function proposalStatistics(
  collection,
  from,
  to
) {
  const result = await summarize(
    collection,

    {
      pending: eq(
        "status",
        "pending"
      ),

      approved: eq(
        "status",
        "approved"
      ),

      rejected: eq(
        "status",
        "rejected"
      ),

      recent: createdWithin(
        from,
        to
      ),
    }
  );

  return {
    total: result.total,

    pending: result.pending,

    approved: result.approved,

    rejected: result.rejected,

    other:
      result.total -
      result.pending -
      result.approved -
      result.rejected,

    recent: result.recent,
  };
}

// =====================================
// DATABASE HEALTH
// =====================================

async function databaseHealth(
  getDatabase
) {
  try {
    const result =
      await getDatabase().command({
        ping: 1,
      });

    return result.ok === 1
      ? "reachable"
      : "unavailable";

  } catch {
    // Do not expose database connection
    // details, credentials or hostnames.

    return "unavailable";
  }
}

// =====================================
// MAIN ADMIN STATISTICS SERVICE
// =====================================

export async function getAdminStatistics() {
  const db = getMainDB();

  const to = new Date();

  const from = new Date(
    to.getTime() - 7 * DAY_MS
  );

  const [
    users,
    addresses,
    localities,
    localityProposals,
    termProposals,
    auditHealth,
  ] = await Promise.all([
    userStatistics(db, from, to),

    addressStatistics(db, from, to),

    localityStatistics(db),

    proposalStatistics(
      db.collection(
        "locality_proposals"
      ),
      from,
      to
    ),

    proposalStatistics(
      db.collection(
        "locality_term_proposals"
      ),
      from,
      to
    ),

    databaseHealth(getAuditDB),
  ]);

  const proposalTotals = {};

  for (const key of [
    "total",
    "pending",
    "approved",
    "rejected",
    "other",
  ]) {
    proposalTotals[key] =
      localityProposals[key] +
      termProposals[key];
  }

  const {
    recent: recentUsers,
    ...userSummary
  } = users;

  const {
    recent: recentAddresses,
    ...addressSummary
  } = addresses;

  const {
    recent: recentLocalityProposals,
    ...localityProposalSummary
  } = localityProposals;

  const {
    recent: recentTermProposals,
    ...termProposalSummary
  } = termProposals;

  return {
    users: userSummary,

    addresses: addressSummary,

    dataset: {
      localities,

      proposals: {
        ...proposalTotals,

        byType: {
          locality:
            localityProposalSummary,

          term:
            termProposalSummary,
        },
      },
    },

    activity: {
      periodDays: 7,

      from: from.toISOString(),

      to: to.toISOString(),

      newUsers: recentUsers,

      newAddressRequests:
        recentAddresses,

      newProposals:
        recentLocalityProposals +
        recentTermProposals,
    },

    system: {
      status:
        auditHealth === "reachable"
          ? "operational"
          : "degraded",

      databases: {
        main: "reachable",

        audit: auditHealth,
      },
    },

    generatedAt:
      new Date().toISOString(),
  };
}
