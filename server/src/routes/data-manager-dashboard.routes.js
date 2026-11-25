import { Router } from "express";
import { getMainDB } from "../config/database.js";

const router = Router();

const BASE = "/p14/data-manager/dashboard";

// Authentication, authorization, rate limiting
// and no-cache protection are inherited from
// the parent Data Manager router.

async function proposalSummary(collection, userId, kind) {
  const [result] = await collection.aggregate(
    [
      {
        $match: {
          requestedBy: userId,
        },
      },

      {
        $facet: {
          counts: [
            {
              $group: {
                _id: "$status",
                total: { $sum: 1 },
              },
            },
          ],

          recent: [
            { $sort: { _id: -1 } },
            { $limit: 5 },

            {
              $project: {
                _id: 1,
                localityId: 1,
                operation: 1,
                field: 1,
                status: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },
    ],

    { maxTimeMS: 10000 }
  ).toArray();

  const counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  for (const item of result?.counts ?? []) {
    if (Object.hasOwn(counts, item._id)) {
      counts[item._id] = item.total;
    }
  }

  return {
    counts,

    recent: (result?.recent ?? []).map(record => ({
      proposalId: String(record._id),
      kind,
      localityId: record.localityId,
      operation: record.operation,
      field: record.field ?? null,
      status: record.status,
      createdAt: record.createdAt,
    })),
  };
}

router.get(BASE, async (req, res) => {
  if (Object.keys(req.query).length > 0) {
    return res.status(400).json({
      success: false,
      code: "INVALID_DASHBOARD_QUERY",
      message: "Unexpected query parameters.",
    });
  }

  const db = getMainDB();

  const localities = db.collection("localities");
  const addresses = db.collection("address_requests");

  const [
    totalLocalities,
    approvedLocalities,
    totalEscalated,
    localityProposals,
    termProposals,
  ] = await Promise.all([
    localities.countDocuments(
      {},
      { maxTimeMS: 10000 }
    ),

    localities.countDocuments(
      { approved: true },
      { maxTimeMS: 10000 }
    ),

    addresses.countDocuments(
      {
        decision: "review_requested",
        "reviewAssignment.status": "escalated",
      },
      { maxTimeMS: 10000 }
    ),

    proposalSummary(
      db.collection("locality_proposals"),
      req.user._id,
      "locality"
    ),

    proposalSummary(
      db.collection("locality_term_proposals"),
      req.user._id,
      "term"
    ),
  ]);

  const proposals = {
    pending:
      localityProposals.counts.pending +
      termProposals.counts.pending,

    approved:
      localityProposals.counts.approved +
      termProposals.counts.approved,

    rejected:
      localityProposals.counts.rejected +
      termProposals.counts.rejected,
  };

  const recentProposals = [
    ...localityProposals.recent,
    ...termProposals.recent,
  ]
    .sort((a, b) =>
      b.proposalId.localeCompare(a.proposalId)
    )
    .slice(0, 5);

  return res.json({
    success: true,

    summary: {
      totalLocalities,
      approvedLocalities,

      totalEscalated,

      proposals: {
        ...proposals,

        total:
          proposals.pending +
          proposals.approved +
          proposals.rejected,
      },
    },

    recentProposals,

    generatedAt: new Date().toISOString(),
  });
});

export default router;
