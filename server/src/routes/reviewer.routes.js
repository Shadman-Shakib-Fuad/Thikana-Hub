import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import rateLimit from "express-rate-limit";

import { env } from "../config/env.js";
import { getMainDB } from "../config/database.js";

import {
  requireAuth,
  requireRole,
} from "../middleware/auth.middleware.js";

import { recordAudit } from "../services/audit.service.js";

import {
  decryptData,
  addressAAD,
} from "../utils/encryption.js";

import {
  getApprovedReviewLocalities,
  submitReviewDecision,
} from "../services/review-decision.service.js";

const router = Router();

// =====================================
// REVIEW HISTORY INDEX
// =====================================

export async function initializeReviewerHistoryIndex() {
  await getMainDB()
    .collection("address_requests")
    .createIndex(
      {
        "reviewHistory.reviewerId": 1,
        _id: -1,
      },
      {
        name: "reviewer_archived_history",

        partialFilterExpression: {
          "reviewHistory.reviewerId": {
            $exists: true,
          },
        },
      }
    );

  console.log(
    "[DATABASE] Reviewer history index initialized"
  );
}

// =====================================
// SECURITY MIDDLEWARE
// =====================================

function noCache(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

function requireTrustedOrigin(req, res, next) {
  if (req.get("Origin") !== env.CLIENT_URL) {
    return res.status(403).json({
      success: false,
      code: "UNTRUSTED_ORIGIN",
      message: "Request origin is not allowed.",
    });
  }

  next();
}

const reviewerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) =>
    String(req.user._id),

  message: {
    success: false,
    code: "REVIEWER_RATE_LIMIT",
    message: "Too many reviewer requests.",
  },
});

// =====================================
// VALIDATION SCHEMAS
// =====================================

const objectIdSchema = z.string()
  .regex(/^[a-f0-9]{24}$/i);

const revisionSchema = z.number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);

const noteSchema = z.string()
  .trim()
  .min(5)
  .max(1000);

const queueSchema = z.object({
  limit: z.string()
    .regex(/^(?:[1-9]|1[0-9]|20)$/)
    .optional(),

  cursor: objectIdSchema.optional(),

  status: z.enum([
    "pending",
    "resolved",
    "escalated",
  ]).optional(),
}).strict();

const decisionSchema = z.discriminatedUnion(
  "decision",
  [
    z.object({
      decision: z.literal("resolved"),

      localityId: z.string()
        .min(1)
        .max(128),

      note: noteSchema,

      revision: revisionSchema,
    }).strict(),

    z.object({
      decision: z.literal("escalated"),

      note: noteSchema,

      revision: revisionSchema,
    }).strict(),
  ]
);

// =====================================
// ASSIGNMENT FILTERS
// =====================================

function assignedFilter(
  reviewerId,
  status = "pending"
) {
  return {
    decision: "review_requested",

    "reviewAssignment.reviewerId":
      reviewerId,

    "reviewAssignment.status":
      status,
  };
}

function historyFilter(reviewerId, status) {
  return {
    $or: [
      {
        "reviewAssignment.reviewerId":
          reviewerId,

        "reviewAssignment.status":
          status,
      },

      {
        reviewHistory: {
          $elemMatch: {
            reviewerId,
            status,
          },
        },
      },
    ],
  };
}

function findReviewerEntry(
  record,
  reviewerId,
  status
) {
  const current = record.reviewAssignment;

  if (
    current?.status === status &&
    String(current.reviewerId) ===
      String(reviewerId)
  ) {
    return current;
  }

  const history = Array.isArray(record.reviewHistory)
    ? record.reviewHistory
    : [];

  return [...history]
    .reverse()
    .find(
      (entry) =>
        entry.status === status &&
        String(entry.reviewerId) ===
          String(reviewerId)
    );
}

// =====================================
// RESPONSE HELPERS
// =====================================

function reviewNotFound(res) {
  return res.status(404).json({
    success: false,
    code: "REVIEW_NOT_FOUND",
    message: "Assigned review request was not found.",
  });
}

function invalidId(res) {
  return res.status(400).json({
    success: false,
    code: "INVALID_REVIEW_ID",
    message: "Invalid review request ID.",
  });
}

function handleServiceError(error, res, next) {
  const knownCodes = [
    "REVIEW_NOT_FOUND",
    "REVIEW_ALREADY_DECIDED",
    "REVISION_CONFLICT",
    "INVALID_REVIEW_LOCALITY",
    "REVIEW_DECISION_CONFLICT",
    "LOCALITY_DATA_INVALID",
    "LOCALITY_LIMIT_EXCEEDED",
  ];

  if (knownCodes.includes(error.code)) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  return next(error);
}

// =====================================
// GET REVIEW QUEUE AND HISTORY
// =====================================

router.get(
  "/p14/reviewer/queue",

  noCache,
  requireAuth,
  requireRole("reviewer"),
  reviewerLimiter,

  async (req, res) => {
    const parsed = queueSchema.safeParse(
      req.query
    );

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_REVIEW_QUERY",
        message: "Invalid review queue parameters.",
      });
    }

    const limit =
      Number(parsed.data.limit || "10");

    const status =
      parsed.data.status || "pending";

    const reviewerId =
      req.user._id;

    const filter =
      status === "pending"
        ? assignedFilter(reviewerId)
        : historyFilter(reviewerId, status);

    if (parsed.data.cursor) {
      filter._id = {
        $lt: new ObjectId(
          parsed.data.cursor
        ),
      };
    }

    const records = await getMainDB()
      .collection("address_requests")
      .find(
        filter,
        {
          projection: {
            _id: 1,
            status: 1,
            decision: 1,
            revision: 1,
            createdAt: 1,
            updatedAt: 1,

            reviewAssignment: 1,

            reviewHistory: 1,
          },
        }
      )
      .sort({ _id: -1 })
      .limit(limit + 1)
      .toArray();

    const hasMore =
      records.length > limit;

    const page =
      records.slice(0, limit);

    const items = [];

    for (const record of page) {
      const entry = findReviewerEntry(
        record,
        reviewerId,
        status
      );

      if (!entry) continue;

      // Return only the requesting reviewer's
      // own matching history metadata.

      items.push({
        jobId:
          record._id.toString(),

        status:
          record.status,

        decision:
          record.decision ?? null,

        revision:
          entry.addressRevision ??
          record.revision ??
          0,

        reviewStatus:
          entry.status,

        assignedAt:
          entry.assignedAt,

        decidedAt:
          entry.decidedAt ?? null,

        merchantDisposition:
          entry.merchantDisposition ?? null,

        merchantDecidedAt:
          entry.merchantDecidedAt ?? null,

        createdAt:
          record.createdAt,

        updatedAt:
          record.updatedAt,
      });
    }

    return res.status(200).json({
      success: true,
      items,

      pagination: {
        limit,
        hasMore,

        nextCursor:
          hasMore && page.length > 0
            ? page[page.length - 1]._id.toString()
            : null,
      },
    });
  }
);

// =====================================
// GET APPROVED LOCALITIES
// =====================================

router.get(
  "/p14/reviewer/queue/:jobId/localities",

  noCache,
  requireAuth,
  requireRole("reviewer"),
  reviewerLimiter,

  async (req, res, next) => {
    const parsed = objectIdSchema.safeParse(
      req.params.jobId
    );

    if (!parsed.success) {
      return invalidId(res);
    }

    const addressId =
      new ObjectId(parsed.data);

    const assigned = await getMainDB()
      .collection("address_requests")
      .findOne(
        {
          _id: addressId,

          ...assignedFilter(req.user._id),
        },
        {
          projection: { _id: 1 },
        }
      );

    if (!assigned) {
      return reviewNotFound(res);
    }

    try {
      const items =
        await getApprovedReviewLocalities();

      return res.status(200).json({
        success: true,
        items,
        total: items.length,
      });

    } catch (error) {
      return handleServiceError(
        error,
        res,
        next
      );
    }
  }
);

// =====================================
// GET ASSIGNED REVIEW DETAILS
// =====================================

router.get(
  "/p14/reviewer/queue/:jobId",

  noCache,
  requireAuth,
  requireRole("reviewer"),
  reviewerLimiter,

  async (req, res) => {
    const parsed = objectIdSchema.safeParse(
      req.params.jobId
    );

    if (!parsed.success) {
      return invalidId(res);
    }

    const addressId =
      new ObjectId(parsed.data);

    const reviewerId = req.user._id;

    const record = await getMainDB()
      .collection("address_requests")
      .findOne(
        {
          _id: addressId,

          ...assignedFilter(reviewerId),
        },
        {
          projection: {
            _id: 1,
            ownerId: 1,
            encryptedPayload: 1,
            status: 1,
            decision: 1,
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
            reviewAssignment: 1,
          },
        }
      );

    if (!record) {
      await recordAudit({
        req,
        userId: reviewerId,
        targetId: addressId,
        action: "REVIEW_DETAIL_ACCESS",
        result: "denied",
      });

      return reviewNotFound(res);
    }

    const decrypted = decryptData(
      record.encryptedPayload,

      env.ADDRESS_ENCRYPTION_KEY,

      addressAAD(
        record._id,
        record.ownerId
      )
    );

    await recordAudit({
      req,
      userId: reviewerId,
      targetId: addressId,
      action: "REVIEW_DETAIL_ACCESS",
      result: "success",
    });

    return res.status(200).json({
      success: true,

      jobId:
        record._id.toString(),

      originalAddress:
        decrypted.originalAddress,

      candidates:
        decrypted.candidates,

      ambiguous:
        decrypted.ambiguous,

      status:
        record.status,

      decision:
        record.decision,

      revision:
        record.revision ?? 0,

      reviewStatus:
        record.reviewAssignment.status,

      assignedAt:
        record.reviewAssignment.assignedAt,

      createdAt:
        record.createdAt,

      updatedAt:
        record.updatedAt,
    });
  }
);

// =====================================
// SUBMIT REVIEW DECISION
// =====================================

router.post(
  "/p14/reviewer/queue/:jobId/decision",

  noCache,
  requireTrustedOrigin,
  requireAuth,
  requireRole("reviewer"),
  reviewerLimiter,

  async (req, res, next) => {
    const parsedId = objectIdSchema.safeParse(
      req.params.jobId
    );

    if (!parsedId.success) {
      return invalidId(res);
    }

    const parsedBody = decisionSchema.safeParse(
      req.body
    );

    if (!parsedBody.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_REVIEW_DECISION",

        message:
          "Provide a valid decision, revision and reason of 5-1000 characters.",
      });
    }

    try {
      const result = await submitReviewDecision({
        req,

        addressId:
          new ObjectId(parsedId.data),

        reviewerId:
          req.user._id,

        input:
          parsedBody.data,
      });

      return res.status(200).json(result);

    } catch (error) {
      return handleServiceError(
        error,
        res,
        next
      );
    }
  }
);

export default router;