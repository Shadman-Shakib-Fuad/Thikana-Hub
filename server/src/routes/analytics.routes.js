import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";

import { getMainDB } from "../config/database.js";

import {
  requireAuth,
  requireRole,
} from "../middleware/auth.middleware.js";

const router = Router();

// =====================================
// ANALYTICS CONFIGURATION
// =====================================

const TIME_ZONE = "Asia/Dhaka";

const MAX_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

const MIN_DATE = "2020-01-01";

// =====================================
// SECURITY MIDDLEWARE
// =====================================

function noCache(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,

  limit: 30,

  standardHeaders: true,

  legacyHeaders: false,

  keyGenerator: (req) =>
    String(req.user._id),

  message: {
    success: false,
    code: "ANALYTICS_RATE_LIMIT",
    message:
      "Too many analytics requests. Try again later.",
  },
});

// =====================================
// DATE VALIDATION
// =====================================

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(
    `${value}T00:00:00.000Z`
  );

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

const dateSchema = z
  .string()
  .refine(isValidDate);

const querySchema = z.object({
  from: dateSchema.optional(),

  to: dateSchema.optional(),
}).strict();

// =====================================
// BANGLADESH DATE HELPERS
// =====================================

function getDhakaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: TIME_ZONE,

      year: "numeric",

      month: "2-digit",

      day: "2-digit",
    }
  ).formatToParts(date);

  const get = (type) =>
    parts.find((part) => part.type === type)?.value;

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

function countDays(from, to) {
  const start = Date.parse(
    `${from}T00:00:00.000Z`
  );

  const end = Date.parse(
    `${to}T00:00:00.000Z`
  );

  return Math.round(
    (end - start) / DAY_MS
  ) + 1;
}

function emptyMetrics() {
  return {
    total: 0,

    confirmed: 0,

    reviewRequested: 0,

    awaitingDecision: 0,

    noConfidentMatch: 0,

    saved: 0,
  };
}

function invalidRange(res) {
  return res.status(400).json({
    success: false,

    code: "INVALID_DATE_RANGE",

    message:
      "Select a valid date range of 1–90 days, from 2020 onward and not beyond today.",
  });
}

// =====================================
// MERCHANT ANALYTICS API
// =====================================

router.get(
  "/p14/analytics",

  noCache,

  requireAuth,

  requireRole("merchant"),

  analyticsLimiter,

  async (req, res) => {
    // =================================
    // VALIDATE QUERY PARAMETERS
    // =================================

    const parsed = querySchema.safeParse(
      req.query
    );

    if (!parsed.success) {
      return res.status(400).json({
        success: false,

        code: "INVALID_ANALYTICS_QUERY",

        message:
          "Invalid analytics query parameters.",
      });
    }

    const today = getDhakaDate();

    const { from, to } = parsed.data;

    // Custom ranges require both dates
    if (
      (from && !to) ||
      (!from && to)
    ) {
      return invalidRange(res);
    }

    const rangeFrom =
      from || addDays(today, -6);

    const rangeTo =
      to || today;

    const days = countDays(
      rangeFrom,
      rangeTo
    );

    if (
      rangeFrom < MIN_DATE ||
      rangeFrom > rangeTo ||
      rangeTo > today ||
      days < 1 ||
      days > MAX_DAYS
    ) {
      return invalidRange(res);
    }

    // Bangladesh midnight boundaries.
    // Supported dates begin in 2020.
    const startDate = new Date(
      `${rangeFrom}T00:00:00+06:00`
    );

    const endDate = new Date(
      `${addDays(rangeTo, 1)}T00:00:00+06:00`
    );

    const ownerId = req.user._id;

    // =================================
    // METADATA-ONLY ANALYTICS
    // =================================

    const rows = await getMainDB()
      .collection("address_requests")
      .aggregate(
        [
          // Match authenticated owner FIRST
          {
            $match: {
              ownerId,

              createdAt: {
                $gte: startDate,
                $lt: endDate,
              },
            },
          },

          // Project metadata only.
          // Never include encrypted address content.
          {
            $project: {
              _id: 0,

              createdAt: 1,

              status: 1,

              decision: {
                $ifNull: [
                  "$decision",
                  null,
                ],
              },

              saved: {
                $eq: [
                  "$saved",
                  true,
                ],
              },
            },
          },

          // Group by Bangladesh calendar date
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",

                  date: "$createdAt",

                  timezone: TIME_ZONE,
                },
              },

              total: {
                $sum: 1,
              },

              confirmed: {
                $sum: {
                  $cond: [
                    {
                      $eq: [
                        "$status",
                        "confirmed",
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },

              reviewRequested: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        {
                          $ne: [
                            "$status",
                            "confirmed",
                          ],
                        },
                        {
                          $eq: [
                            "$decision",
                            "review_requested",
                          ],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },

              awaitingDecision: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        {
                          $ne: [
                            "$status",
                            "confirmed",
                          ],
                        },
                        {
                          $ne: [
                            "$decision",
                            "review_requested",
                          ],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },

              noConfidentMatch: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        {
                          $eq: [
                            "$status",
                            "no_confident_match",
                          ],
                        },
                        {
                          $ne: [
                            "$decision",
                            "review_requested",
                          ],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },

              saved: {
                $sum: {
                  $cond: [
                    "$saved",
                    1,
                    0,
                  ],
                },
              },
            },
          },

          {
            $sort: {
              _id: 1,
            },
          },
        ],

        {
          maxTimeMS: 10000,
        }
      )
      .toArray();

    // =================================
    // BUILD DAILY STATISTICS
    // =================================

    const rowMap = new Map(
      rows.map((row) => [
        row._id,
        row,
      ])
    );

    const daily = [];

    const summary = emptyMetrics();

    // Include every date, even zero-activity days
    for (let i = 0; i < days; i++) {
      const date = addDays(
        rangeFrom,
        i
      );

      const row = rowMap.get(date);

      const metrics = emptyMetrics();

      for (const key of Object.keys(metrics)) {
        metrics[key] = row?.[key] ?? 0;

        summary[key] += metrics[key];
      }

      daily.push({
        date,

        ...metrics,
      });
    }

    // =================================
    // CONFIRMATION RATE
    // =================================

    const confirmationRate =
      summary.total === 0
        ? 0
        : Math.round(
            (
              summary.confirmed /
              summary.total
            ) * 1000
          ) / 10;

    // =================================
    // RETURN ANALYTICS
    // =================================

    return res.status(200).json({
      success: true,

      range: {
        from: rangeFrom,

        to: rangeTo,

        days,

        timeZone: TIME_ZONE,
      },

      summary: {
        ...summary,

        confirmationRate,
      },

      daily,

      generatedAt:
        new Date().toISOString(),
    });
  }
);

export default router;