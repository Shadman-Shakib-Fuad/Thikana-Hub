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

import {
  recordAudit,
} from "../services/audit.service.js";

import {
  encryptData,
  decryptData,
  addressAAD,
} from "../utils/encryption.js";

const router = Router();

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

const feedbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) =>
    String(req.user._id),

  message: {
    success: false,
    code: "FEEDBACK_RATE_LIMIT",
    message: "Too many requests. Try again later.",
  },
});

// =====================================
// INPUT VALIDATION
// =====================================

const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i);

const feedbackSchema = z.discriminatedUnion(
  "decision",
  [
    z.object({
      jobId: objectIdSchema,

      decision: z.literal("confirmed"),

      localityId: z.string().min(1).max(128),
    }).strict(),

    z.object({
      jobId: objectIdSchema,

      decision: z.literal("no_correct_match"),
    }).strict(),
  ]
);

const historySchema = z.object({
  limit: z
    .string()
    .regex(/^(?:[1-9]|1[0-9]|20)$/)
    .optional(),

  cursor: objectIdSchema.optional(),
}).strict();

// =====================================
// ADDRESS FEEDBACK
// =====================================

router.post(
  "/p14/address-feedback",

  noCache,
  requireTrustedOrigin,
  requireAuth,
  requireRole("merchant"),
  feedbackLimiter,

  async (req, res) => {
    const parsed = feedbackSchema.safeParse(
      req.body
    );

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_FEEDBACK",
        message: "Invalid address feedback.",
      });
    }

    const input = parsed.data;

    const ownerId = req.user._id;

    const addressId = new ObjectId(
      input.jobId
    );

    const db = getMainDB();

    const collection = db.collection(
      "address_requests"
    );

    // Find record owned by authenticated user
    const record = await collection.findOne({
      _id: addressId,
      ownerId,
    });

    if (!record) {
      await recordAudit({
        req,
        userId: ownerId,
        targetId: addressId,
        action: "ADDRESS_FEEDBACK",
        result: "denied",
      });

      return res.status(404).json({
        success: false,
        code: "ADDRESS_NOT_FOUND",
        message: "Address request was not found.",
      });
    }

    // Prevent duplicate or conflicting decisions
    if (record.decision || record.status === "confirmed") {
      return res.status(409).json({
        success: false,
        code: "ALREADY_DECIDED",
        message: "Feedback was already submitted.",
      });
    }

    const aad = addressAAD(
      record._id,
      record.ownerId
    );

    // Decrypt only after ownership verification
    const decrypted = decryptData(
      record.encryptedPayload,
      env.ADDRESS_ENCRYPTION_KEY,
      aad
    );

    let selectedCandidate = null;

    let status = "needs_review";

    let decision = "review_requested";

    // =====================================
    // CONFIRM A CANDIDATE
    // =====================================

    if (input.decision === "confirmed") {
      selectedCandidate =
        decrypted.candidates.find(
          (candidate) =>
            candidate.localityId === input.localityId
        );

      // Do not trust arbitrary candidate IDs
      if (!selectedCandidate) {
        return res.status(400).json({
          success: false,
          code: "INVALID_CANDIDATE",
          message: "Select a valid suggested locality.",
        });
      }

      // Check whether locality is still approved
      const approvedLocality = await db
        .collection("localities")
        .findOne(
          {
            id: input.localityId,
            approved: true,
          },
          {
            projection: { _id: 1 },
          }
        );

      if (!approvedLocality) {
        return res.status(409).json({
          success: false,
          code: "LOCALITY_UNAVAILABLE",
          message:
            "This locality is no longer available. Please search again.",
        });
      }

      status = "confirmed";

      decision = "confirmed";
    }

    // =====================================
    // ENCRYPT UPDATED PRIVATE DATA
    // =====================================

    const now = new Date();

    const encryptedPayload = encryptData(
      {
        ...decrypted,

        selectedCandidate,

        requiresConfirmation: false,

        merchantFeedback: {
          decision,
          decidedAt: now.toISOString(),
        },
      },

      env.ADDRESS_ENCRYPTION_KEY,

      aad
    );

    await recordAudit({
      req,
      userId: ownerId,
      targetId: addressId,
      action: "ADDRESS_FEEDBACK",
      result: "started",
    });

    // Atomic conditional update prevents
    // two simultaneous conflicting decisions
    const updated = await collection.updateOne(
      {
        _id: addressId,

        ownerId,

        decision: { $exists: false },

        status: {
          $in: [
            "needs_review",
            "no_confident_match",
          ],
        },
      },

      {
        $set: {
          encryptedPayload,
          status,
          decision,
          updatedAt: now,
        },
      }
    );

    if (updated.modifiedCount !== 1) {
      await recordAudit({
        req,
        userId: ownerId,
        targetId: addressId,
        action: "ADDRESS_FEEDBACK",
        result: "conflict",
      });

      return res.status(409).json({
        success: false,
        code: "DECISION_CONFLICT",
        message:
          "The address was already updated. Refresh your results.",
      });
    }

    await recordAudit({
      req,
      userId: ownerId,
      targetId: addressId,

      action:
        decision === "confirmed"
          ? "ADDRESS_CONFIRM"
          : "ADDRESS_REVIEW_REQUEST",

      result: "success",
    });

    return res.status(200).json({
      success: true,

      jobId: input.jobId,

      status,

      decision,

      selectedCandidate,

      requiresConfirmation: false,

      message:
        decision === "confirmed"
          ? "Locality confirmed successfully."
          : "Address marked for manual review.",

      updatedAt: now,
    });
  }
);

// =====================================
// MERCHANT SEARCH HISTORY
// =====================================

router.get(
  "/p14/address-history",

  noCache,
  requireAuth,
  requireRole("merchant"),

  async (req, res) => {
    const parsed = historySchema.safeParse(
      req.query
    );

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_HISTORY_QUERY",
        message: "Invalid pagination parameters.",
      });
    }

    const limit = Number(
      parsed.data.limit || "10"
    );

    const ownerId = req.user._id;

    // Users can only retrieve their own records
    const filter = {
      ownerId,
    };

    if (parsed.data.cursor) {
      filter._id = {
        $lt: new ObjectId(parsed.data.cursor),
      };
    }

    const records = await getMainDB()
      .collection("address_requests")
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .toArray();

    const hasMore = records.length > limit;

    const page = records.slice(0, limit);

    // Decrypt only authorized page records
    const items = page.map((record) => {
      const decrypted = decryptData(
        record.encryptedPayload,

        env.ADDRESS_ENCRYPTION_KEY,

        addressAAD(
          record._id,
          record.ownerId
        )
      );

      return {
        jobId: record._id.toString(),

        originalAddress:
          decrypted.originalAddress,

        status: record.status,

        decision:
          record.decision || null,

        candidateCount:
          decrypted.candidates.length,

        selectedCandidate:
          decrypted.selectedCandidate || null,

        requiresConfirmation:
          decrypted.requiresConfirmation,

        createdAt: record.createdAt,

        updatedAt: record.updatedAt,
      };
    });

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

export default router;