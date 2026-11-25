import { Router } from "express";
import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
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
  encryptData,
  decryptData,
  addressAAD,
} from "../utils/encryption.js";

const router = Router();

// =====================================
// CONFIGURATION
// =====================================

const HISTORY_LIMIT = 20;

const objectIdSchema = z.string()
  .regex(/^[a-f0-9]{24}$/i);

const decisionSchema = z.object({
  decision: z.enum([
    "accept",
    "request_re_review",
  ]),

  revision: z.number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER),

  reviewVersion: z.string()
    .regex(/^[a-f0-9]{64}$/),
}).strict();

// =====================================
// SECURITY MIDDLEWARE
// =====================================

function noCache(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

function trustedOrigin(req, res, next) {
  if (req.get("Origin") !== env.CLIENT_URL) {
    return fail(
      res,
      403,
      "UNTRUSTED_ORIGIN",
      "Request origin is not allowed."
    );
  }

  next();
}

const reviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) =>
    String(req.user._id),

  message: {
    success: false,
    code: "MERCHANT_REVIEW_RATE_LIMIT",
    message: "Too many review requests.",
  },
});

// =====================================
// COMMON HELPERS
// =====================================

function fail(res, status, code, message) {
  return res.status(status).json({
    success: false,
    code,
    message,
  });
}

function notFound(res) {
  return fail(
    res,
    404,
    "REVIEW_NOT_FOUND",
    "Address review was not found."
  );
}

function makeReviewVersion(record) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        record._id.toString(),
        record.revision ?? 0,
        record.encryptedPayload.iv,
      ])
    )
    .digest("hex");
}

function decryptRecord(record) {
  return decryptData(
    record.encryptedPayload,
    env.ADDRESS_ENCRYPTION_KEY,
    addressAAD(record._id, record.ownerId)
  );
}

function snapshotLocality(record) {
  const locality = record.locality ?? record;

  return {
    localityId: record.id,

    locality: {
      nameEn: locality.nameEn,
      nameBn: locality.nameBn,
      areaEn: locality.areaEn ?? "",
      areaBn: locality.areaBn ?? "",
      districtEn: locality.districtEn ?? "",
      districtBn: locality.districtBn ?? "",
      divisionEn: locality.divisionEn ?? "",
      divisionBn: locality.divisionBn ?? "",
    },
  };
}

function sameLocality(a, b) {
  if (
    !a ||
    !b ||
    a.localityId !== b.localityId
  ) {
    return false;
  }

  return Object.keys(b.locality).every(
    (key) =>
      a.locality?.[key] === b.locality[key]
  );
}

function publicOutcome(outcome) {
  return {
    recommendation:
      outcome.recommendation ?? null,

    note:
      outcome.note ?? "",

    decidedAt:
      outcome.decidedAt,

    merchantDisposition:
      outcome.merchantDisposition ?? null,
  };
}

// =====================================
// GET MERCHANT REVIEW RESULT
// =====================================

router.get(
  "/p14/merchant-reviews/:jobId",

  noCache,
  requireAuth,
  requireRole("merchant"),
  reviewLimiter,

  async (req, res) => {
    const parsed = objectIdSchema.safeParse(
      req.params.jobId
    );

    if (!parsed.success) {
      return fail(
        res,
        400,
        "INVALID_REVIEW_ID",
        "Invalid address request ID."
      );
    }

    const addressId =
      new ObjectId(parsed.data);

    const ownerId = req.user._id;

    const record = await getMainDB()
      .collection("address_requests")
      .findOne({
        _id: addressId,
        ownerId,

        decision: {
          $in: [
            "review_requested",
            "confirmed",
          ],
        },
      });

    if (!record) {
      await recordAudit({
        req,
        userId: ownerId,
        targetId: addressId,
        action: "MERCHANT_REVIEW_ACCESS",
        result: "denied",
      });

      return notFound(res);
    }

    const revision =
      record.revision ?? 0;

    const base = {
      success: true,

      jobId: record._id.toString(),

      revision,

      addressStatus: record.status,
    };

    // Confirmed through manual review.

    if (record.decision === "confirmed") {
      const payload = decryptRecord(record);

      const outcome = payload.reviewOutcome;

      if (
        !outcome ||
        outcome.merchantDisposition !== "accepted" ||
        outcome.addressRevision !== revision
      ) {
        return notFound(res);
      }

      await recordAudit({
        req,
        userId: ownerId,
        targetId: addressId,
        action: "MERCHANT_REVIEW_ACCESS",
        result: "success",
      });

      return res.status(200).json({
        ...base,

        reviewStatus: "accepted",

        reviewVersion: null,

        outcome: publicOutcome(outcome),

        canAccept: false,

        canRequestReReview: false,
      });
    }

    // Waiting for initial assignment
    // or reassignment after re-review.

    if (!record.reviewAssignment) {
      return res.status(200).json({
        ...base,

        reviewStatus: "unassigned",

        reviewVersion: null,

        outcome: null,

        canAccept: false,

        canRequestReReview: false,
      });
    }

    const assignment = record.reviewAssignment;

    // Assigned but not yet processed.

    if (assignment.status === "pending") {
      return res.status(200).json({
        ...base,

        reviewStatus: "pending",

        reviewVersion: null,

        outcome: null,

        canAccept: false,

        canRequestReReview: false,
      });
    }

    // Resolved or escalated review.

    const payload = decryptRecord(record);

    const outcome = payload.reviewOutcome;

    if (
      !outcome ||
      outcome.decision !== assignment.status ||
      outcome.addressRevision !== revision
    ) {
      return fail(
        res,
        409,
        "REVIEW_STATE_CONFLICT",
        "Review information is unavailable."
      );
    }

    const canDecide =
      assignment.status === "resolved" &&
      Boolean(outcome.recommendation);

    await recordAudit({
      req,
      userId: ownerId,
      targetId: addressId,
      action: "MERCHANT_REVIEW_ACCESS",
      result: "success",
    });

    return res.status(200).json({
      ...base,

      reviewStatus: assignment.status,

      reviewVersion:
        canDecide
          ? makeReviewVersion(record)
          : null,

      outcome: publicOutcome(outcome),

      canAccept: canDecide,

      canRequestReReview: canDecide,
    });
  }
);

// =====================================
// ACCEPT OR REQUEST RE-REVIEW
// =====================================

router.post(
  "/p14/merchant-reviews/:jobId/decision",

  noCache,
  trustedOrigin,
  requireAuth,
  requireRole("merchant"),
  reviewLimiter,

  async (req, res) => {
    const parsedId = objectIdSchema.safeParse(
      req.params.jobId
    );

    const parsedBody = decisionSchema.safeParse(
      req.body
    );

    if (!parsedId.success || !parsedBody.success) {
      return fail(
        res,
        400,
        "INVALID_MERCHANT_REVIEW_DECISION",
        "Provide a valid review ID, decision, revision and review version."
      );
    }

    const input = parsedBody.data;

    const addressId =
      new ObjectId(parsedId.data);

    const ownerId = req.user._id;

    const action =
      input.decision === "accept"
        ? "MERCHANT_REVIEW_ACCEPT"
        : "MERCHANT_RE_REVIEW_REQUEST";

    const db = getMainDB();

    const collection =
      db.collection("address_requests");

    // Address ownership is mandatory.

    const record = await collection.findOne({
      _id: addressId,
      ownerId,
    });

    if (!record) {
      await recordAudit({
        req,
        userId: ownerId,
        targetId: addressId,
        action,
        result: "denied",
      });

      return notFound(res);
    }

    const revision =
      record.revision ?? 0;

    if (input.revision !== revision) {
      return fail(
        res,
        409,
        "REVISION_CONFLICT",
        "The address has changed. Refresh the review."
      );
    }

    if (
      record.decision !== "review_requested" ||
      record.reviewAssignment?.status !== "resolved"
    ) {
      return fail(
        res,
        409,
        "REVIEW_NOT_DECIDABLE",
        "There is no pending recommendation to accept or decline."
      );
    }

    if (
      input.reviewVersion !==
      makeReviewVersion(record)
    ) {
      return fail(
        res,
        409,
        "REVIEW_VERSION_CONFLICT",
        "The review result has changed. Refresh before continuing."
      );
    }

    const payload = decryptRecord(record);

    const outcome = payload.reviewOutcome;

    if (
      !outcome ||
      outcome.decision !== "resolved" ||
      outcome.addressRevision !== revision ||
      !outcome.recommendation
    ) {
      return fail(
        res,
        409,
        "REVIEW_STATE_CONFLICT",
        "The recommendation is no longer available."
      );
    }

    const now = new Date();

    const accepting =
      input.decision === "accept";

    let selectedCandidate = null;

    // =================================
    // REVALIDATE APPROVED LOCALITY
    // =================================

    if (accepting) {
      const locality = await db
        .collection("localities")
        .findOne({
          id: outcome.recommendation.localityId,
          approved: true,
        });

      if (!locality) {
        return fail(
          res,
          409,
          "LOCALITY_UNAVAILABLE",
          "The recommended locality is no longer approved. Request another review."
        );
      }

      const currentSnapshot =
        snapshotLocality(locality);

      if (
        !sameLocality(
          outcome.recommendation,
          currentSnapshot
        )
      ) {
        return fail(
          res,
          409,
          "LOCALITY_CHANGED",
          "The locality information has changed. Request another review."
        );
      }

      // A human recommendation is not
      // an algorithm-generated score.

      selectedCandidate = {
        ...currentSnapshot,

        matchType: "manual_review",

        score: null,

        reasons: [
          "Recommended through manual review and accepted by the merchant.",
        ],

        source: "Manual review",
      };
    }

    // =================================
    // ARCHIVE REVIEW METADATA
    // =================================

    const disposition =
      accepting
        ? "accepted"
        : "re_review_requested";

    const archive = {
      reviewerId:
        record.reviewAssignment.reviewerId,

      status:
        record.reviewAssignment.status,

      assignedAt:
        record.reviewAssignment.assignedAt,

      decidedAt:
        record.reviewAssignment.decidedAt,

      addressRevision: revision,

      merchantDisposition: disposition,

      merchantDecidedAt: now,
    };

    const completedOutcome = {
      ...outcome,

      merchantDisposition: disposition,

      merchantDecidedAt: now.toISOString(),
    };

    // =================================
    // UPDATE ENCRYPTED CONTENT
    // =================================

    let nextPayload;

    if (accepting) {
      nextPayload = {
        ...payload,

        reviewOutcome: completedOutcome,

        selectedCandidate,

        requiresConfirmation: false,

        merchantFeedback: {
          decision: "confirmed",

          source: "review_recommendation",

          decidedAt: now.toISOString(),
        },
      };
    } else {
      nextPayload = {
        ...payload,

        reviewOutcomeHistory: [
          ...(Array.isArray(
            payload.reviewOutcomeHistory
          )
            ? payload.reviewOutcomeHistory
            : []),

          completedOutcome,
        ].slice(-HISTORY_LIMIT),

        selectedCandidate: null,

        requiresConfirmation: false,
      };

      // Remove old active recommendation.
      // The next reviewer will create a new one.

      delete nextPayload.reviewOutcome;
    }

    const encryptedPayload = encryptData(
      nextPayload,

      env.ADDRESS_ENCRYPTION_KEY,

      addressAAD(
        record._id,
        record.ownerId
      )
    );

    await recordAudit({
      req,
      userId: ownerId,
      targetId: addressId,
      action,
      result: "started",
    });

    // =================================
    // ATOMIC MERCHANT DECISION
    // =================================

    const updated = await collection.updateOne(
      {
        _id: addressId,

        ownerId,

        decision: "review_requested",

        revision:
          record.revision === undefined
            ? { $exists: false }
            : record.revision,

        "reviewAssignment.reviewerId":
          record.reviewAssignment.reviewerId,

        "reviewAssignment.status": "resolved",

        "encryptedPayload.iv":
          record.encryptedPayload.iv,
      },

      {
        $set: {
          encryptedPayload,

          decision:
            accepting
              ? "confirmed"
              : "review_requested",

          status:
            accepting
              ? "confirmed"
              : "needs_review",

          saved: false,

          savedAt: null,

          updatedAt: now,
        },

        $push: {
          reviewHistory: {
            $each: [archive],

            $slice: -HISTORY_LIMIT,
          },
        },

        // Remove current assignment.
        // Archived metadata remains available.

        $unset: {
          reviewAssignment: "",
        },
      }
    );

    if (updated.modifiedCount !== 1) {
      await recordAudit({
        req,
        userId: ownerId,
        targetId: addressId,
        action,
        result: "conflict",
      });

      return fail(
        res,
        409,
        "MERCHANT_REVIEW_CONFLICT",
        "Another operation changed the review."
      );
    }

    await recordAudit({
      req,
      userId: ownerId,
      targetId: addressId,
      action,
      result: "success",
    });

    return res.status(200).json({
      success: true,

      jobId: addressId.toString(),

      revision,

      reviewStatus:
        accepting
          ? "accepted"
          : "unassigned",

      decision:
        accepting
          ? "confirmed"
          : "review_requested",

      status:
        accepting
          ? "confirmed"
          : "needs_review",

      selectedCandidate,

      saved: false,

      savedAt: null,

      requiresConfirmation: false,

      updatedAt: now,

      message:
        accepting
          ? "Reviewer recommendation accepted."
          : "A new manual review has been requested.",
    });
  }
);

export default router;