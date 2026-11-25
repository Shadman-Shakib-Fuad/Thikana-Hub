import { Router } from "express";
import rateLimit from "express-rate-limit";

import { getMainDB } from "../config/database.js";

import {
  requireAuth,
  requireRole,
} from "../middleware/auth.middleware.js";

const router = Router();

function noCache(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

const statisticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) =>
    String(req.user._id),

  message: {
    success: false,
    code: "REVIEWER_STATISTICS_RATE_LIMIT",
    message: "Too many statistics requests.",
  },
});

// =====================================
// REVIEWER STATISTICS
// =====================================

router.get(
  "/p14/reviewer/statistics",

  noCache,
  requireAuth,
  requireRole("reviewer"),
  statisticsLimiter,

  async (req, res) => {
    if (Object.keys(req.query).length !== 0) {
      return res.status(400).json({
        success: false,
        code: "INVALID_STATISTICS_QUERY",
        message: "Query parameters are not allowed.",
      });
    }

    const reviewerId = req.user._id;

    // Match only requests associated with
    // the authenticated reviewer.

    const rows = await getMainDB()
      .collection("address_requests")
      .aggregate(
        [
          {
            $match: {
              $or: [
                {
                  "reviewAssignment.reviewerId":
                    reviewerId,
                },
                {
                  "reviewHistory.reviewerId":
                    reviewerId,
                },
              ],
            },
          },

          // Metadata only.
          // Never load encryptedPayload
          // into the application response.

          {
            $project: {
              _id: 0,
              decision: 1,
              reviewAssignment: 1,

              ownHistory: {
                $filter: {
                  input: {
                    $ifNull: [
                      "$reviewHistory",
                      [],
                    ],
                  },

                  as: "entry",

                  cond: {
                    $eq: [
                      "$$entry.reviewerId",
                      reviewerId,
                    ],
                  },
                },
              },
            },
          },

          {
            $project: {
              pending: {
                $and: [
                  {
                    $eq: [
                      "$decision",
                      "review_requested",
                    ],
                  },
                  {
                    $eq: [
                      "$reviewAssignment.reviewerId",
                      reviewerId,
                    ],
                  },
                  {
                    $eq: [
                      "$reviewAssignment.status",
                      "pending",
                    ],
                  },
                ],
              },

              resolved: {
                $or: [
                  {
                    $and: [
                      {
                        $eq: [
                          "$reviewAssignment.reviewerId",
                          reviewerId,
                        ],
                      },
                      {
                        $eq: [
                          "$reviewAssignment.status",
                          "resolved",
                        ],
                      },
                    ],
                  },
                  {
                    $in: [
                      "resolved",
                      "$ownHistory.status",
                    ],
                  },
                ],
              },

              escalated: {
                $or: [
                  {
                    $and: [
                      {
                        $eq: [
                          "$reviewAssignment.reviewerId",
                          reviewerId,
                        ],
                      },
                      {
                        $eq: [
                          "$reviewAssignment.status",
                          "escalated",
                        ],
                      },
                    ],
                  },
                  {
                    $in: [
                      "escalated",
                      "$ownHistory.status",
                    ],
                  },
                ],
              },

              merchantAccepted: {
                $in: [
                  "accepted",
                  "$ownHistory.merchantDisposition",
                ],
              },
            },
          },

          // Count distinct address requests
          // in each category.

          {
            $group: {
              _id: null,

              pending: {
                $sum: {
                  $cond: ["$pending", 1, 0],
                },
              },

              resolved: {
                $sum: {
                  $cond: ["$resolved", 1, 0],
                },
              },

              escalated: {
                $sum: {
                  $cond: ["$escalated", 1, 0],
                },
              },

              merchantAccepted: {
                $sum: {
                  $cond: [
                    "$merchantAccepted",
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],

        {
          maxTimeMS: 10000,
        }
      )
      .toArray();

    const result = rows[0];

    return res.status(200).json({
      success: true,

      summary: {
        pending: result?.pending ?? 0,
        resolved: result?.resolved ?? 0,
        escalated: result?.escalated ?? 0,
        merchantAccepted:
          result?.merchantAccepted ?? 0,
      },

      generatedAt: new Date().toISOString(),
    });
  }
);

export default router;