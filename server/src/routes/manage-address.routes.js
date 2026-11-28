import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import rateLimit from "express-rate-limit";

import { env } from "../config/env.js";
import { isTrustedOrigin } from "../utils/mobile-auth.js";
import { getMainDB } from "../config/database.js";

import {
  requireAuth,
  requireRole,
} from "../middleware/auth.middleware.js";

import {
  recordAudit,
} from "../services/audit.service.js";

import {
  resolveAddress,
} from "../services/matching/engine.js";

import {
  validateAddress,
} from "../services/matching/normalizer.js";

import {
  encryptData,
  decryptData,
  addressAAD,
} from "../utils/encryption.js";

const router = Router();

const MAX_LOCALITIES = 1000;

// =====================================
// SECURITY MIDDLEWARE
// =====================================

function noCache(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

function requireTrustedOrigin(req, res, next) {
  if (!isTrustedOrigin(req, env.CLIENT_URL, env.MOBILE_AUTH_ENABLED)) {
    return res.status(403).json({
      success: false,
      code: "UNTRUSTED_ORIGIN",
      message: "Request origin is not allowed.",
    });
  }

  next();
}

const manageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) =>
    String(req.user._id),

  message: {
    success: false,
    code: "MANAGE_RATE_LIMIT",
    message: "Too many requests. Try again later.",
  },
});

// =====================================
// INPUT VALIDATION
// =====================================

const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i);

const revisionSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);

const editSchema = z.object({
  address: z.string().min(1).max(300),
  revision: revisionSchema,
}).strict();

const deleteSchema = z.object({
  revision: revisionSchema,
}).strict();

// =====================================
// RESPONSE HELPERS
// =====================================

function invalidRequest(res) {
  return res.status(400).json({
    success: false,
    code: "INVALID_MANAGEMENT_REQUEST",
    message: "Invalid address management request.",
  });
}

function notFound(res) {
  return res.status(404).json({
    success: false,
    code: "ADDRESS_NOT_FOUND",
    message: "Address request was not found.",
  });
}

function revisionConflict(res) {
  return res.status(409).json({
    success: false,
    code: "REVISION_CONFLICT",
    message:
      "The address has changed. Refresh its details and try again.",
  });
}

function reviewLocked(res) {
  return res.status(409).json({
    success: false,
    code: "REVIEW_LOCKED",
    message:
      "This address is awaiting manual review and cannot currently be modified.",
  });
}

// =====================================
// ATOMIC UPDATE FILTER
// =====================================

function createUpdateFilter(record) {
  return {
    _id: record._id,

    ownerId: record.ownerId,

    revision:
      record.revision === undefined
        ? { $exists: false }
        : record.revision,

    // Prevent overwriting concurrent
    // encrypted address modifications
    "encryptedPayload.iv":
      record.encryptedPayload.iv,

    // Protect addresses awaiting review
    decision: {
      $ne: "review_requested",
    },
  };
}

// =====================================
// EDIT & RE-RESOLVE ADDRESS
// =====================================

router.patch(
  "/p14/address-requests/:jobId",

  noCache,
  requireTrustedOrigin,
  requireAuth,
  requireRole("merchant"),
  manageLimiter,

  async (req, res) => {
    const parsedId = objectIdSchema.safeParse(
      req.params.jobId
    );

    const parsedBody = editSchema.safeParse(
      req.body
    );

    if (!parsedId.success || !parsedBody.success) {
      return invalidRequest(res);
    }

    const input = parsedBody.data;

    const validation = validateAddress(
      input.address
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ADDRESS",
        message: validation.message,
      });
    }

    const addressId = new ObjectId(
      parsedId.data
    );

    const ownerId = req.user._id;

    const db = getMainDB();

    const collection = db.collection(
      "address_requests"
    );

    // =================================
    // OWNERSHIP VERIFICATION
    // =================================

    const record = await collection.findOne({
      _id: addressId,
      ownerId,
    });

    if (!record) {
      await recordAudit({
        req,
        userId: ownerId,
        targetId: addressId,
        action: "ADDRESS_EDIT",
        result: "denied",
      });

      return notFound(res);
    }

    if (record.decision === "review_requested") {
      return reviewLocked(res);
    }

    const currentRevision =
      record.revision ?? 0;

    if (input.revision !== currentRevision) {
      return revisionConflict(res);
    }

    const aad = addressAAD(
      record._id,
      record.ownerId
    );

    // Verify existing encrypted data integrity
    const previous = decryptData(
      record.encryptedPayload,
      env.ADDRESS_ENCRYPTION_KEY,
      aad
    );

    if (previous.originalAddress === input.address) {
      return res.status(400).json({
        success: false,
        code: "ADDRESS_UNCHANGED",
        message: "The address has not changed.",
      });
    }

    // =================================
    // LOAD APPROVED LOCALITIES
    // =================================

    const localities = await db
      .collection("localities")
      .find(
        { approved: true },
        { projection: { _id: 0 } }
      )
      .limit(MAX_LOCALITIES + 1)
      .toArray();

    if (localities.length === 0) {
      return res.status(503).json({
        success: false,
        code: "DATASET_UNAVAILABLE",
        message:
          "Address dataset is temporarily unavailable.",
      });
    }

    if (localities.length > MAX_LOCALITIES) {
      return res.status(503).json({
        success: false,
        code: "DATASET_LIMIT",
        message:
          "The address dataset exceeds the current processing limit.",
      });
    }

    // =================================
    // GENERATE FRESH MATCHING RESULTS
    // =================================

    const result = resolveAddress(
      input.address,
      localities
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ADDRESS",
        message: result.message,
      });
    }

    const sourceMap = new Map(
      localities.map((item) => [
        item.id,
        item.source,
      ])
    );

    const candidates = result.candidates.map(
      (candidate) => ({
        ...candidate,

        source:
          sourceMap.get(candidate.localityId)
          || null,
      })
    );

    // =================================
    // RE-ENCRYPT PRIVATE ADDRESS DATA
    // =================================

    const encryptedPayload = encryptData(
      {
        originalAddress: input.address,

        candidates,

        ambiguous: result.ambiguous,

        requiresConfirmation:
          result.requiresConfirmation,
      },

      env.ADDRESS_ENCRYPTION_KEY,

      aad
    );

    const now = new Date();

    const revision = currentRevision + 1;

    await recordAudit({
      req,
      userId: ownerId,
      targetId: addressId,
      action: "ADDRESS_EDIT",
      result: "started",
    });

    // =================================
    // ATOMIC DATABASE UPDATE
    // =================================

    const updated = await collection.updateOne(
      createUpdateFilter(record),

      {
        $set: {
          encryptedPayload,

          status: result.status,

          revision,

          // Edited addresses need new confirmation
          saved: false,

          savedAt: null,

          updatedAt: now,
        },

        // Remove previous decision
        $unset: {
          decision: "",
        },
      }
    );

    if (updated.modifiedCount !== 1) {
      await recordAudit({
        req,
        userId: ownerId,
        targetId: addressId,
        action: "ADDRESS_EDIT",
        result: "conflict",
      });

      return revisionConflict(res);
    }

    await recordAudit({
      req,
      userId: ownerId,
      targetId: addressId,
      action: "ADDRESS_EDIT",
      result: "success",
    });

    // =================================
    // RETURN UPDATED ADDRESS
    // =================================

    return res.status(200).json({
      success: true,

      jobId: addressId.toString(),

      originalAddress: input.address,

      status: result.status,

      decision: null,

      selectedCandidate: null,

      revision,

      saved: false,

      savedAt: null,

      candidates,

      ambiguous: result.ambiguous,

      requiresConfirmation:
        result.requiresConfirmation,

      message:
        "Address updated and resolved successfully.",

      createdAt: record.createdAt,

      updatedAt: now,
    });
  }
);

// =====================================
// DELETE ADDRESS REQUEST
// =====================================

router.delete(
  "/p14/address-requests/:jobId",

  noCache,
  requireTrustedOrigin,
  requireAuth,
  requireRole("merchant"),
  manageLimiter,

  async (req, res) => {
    const parsedId = objectIdSchema.safeParse(
      req.params.jobId
    );

    const parsedBody = deleteSchema.safeParse(
      req.body
    );

    if (!parsedId.success || !parsedBody.success) {
      return invalidRequest(res);
    }

    const addressId = new ObjectId(
      parsedId.data
    );

    const ownerId = req.user._id;

    const collection = getMainDB()
      .collection("address_requests");

    // Ownership check
    const record = await collection.findOne({
      _id: addressId,
      ownerId,
    });

    if (!record) {
      await recordAudit({
        req,
        userId: ownerId,
        targetId: addressId,
        action: "ADDRESS_DELETE",
        result: "denied",
      });

      return notFound(res);
    }

    if (record.decision === "review_requested") {
      return reviewLocked(res);
    }

    if (
      parsedBody.data.revision !==
      (record.revision ?? 0)
    ) {
      return revisionConflict(res);
    }

    await recordAudit({
      req,
      userId: ownerId,
      targetId: addressId,
      action: "ADDRESS_DELETE",
      result: "started",
    });

    // Delete only the authenticated
    // merchant's matching record
    const deleted = await collection.deleteOne(
      createUpdateFilter(record)
    );

    if (deleted.deletedCount !== 1) {
      await recordAudit({
        req,
        userId: ownerId,
        targetId: addressId,
        action: "ADDRESS_DELETE",
        result: "conflict",
      });

      return revisionConflict(res);
    }

    await recordAudit({
      req,
      userId: ownerId,
      targetId: addressId,
      action: "ADDRESS_DELETE",
      result: "success",
    });

    return res.status(200).json({
      success: true,

      jobId: addressId.toString(),

      deleted: true,

      message: "Address deleted successfully.",
    });
  }
);

export default router;