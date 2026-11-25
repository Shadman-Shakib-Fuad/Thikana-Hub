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

const router = Router();

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

const savedLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => String(req.user._id),

  message: {
    success: false,
    code: "SAVED_RATE_LIMIT",
    message: "Too many requests. Try again later.",
  },
});

const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i);

const saveSchema = z.object({
  saved: z.boolean(),

  revision: z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
}).strict();

const paginationSchema = z.object({
  limit: z
    .string()
    .regex(/^(?:[1-9]|1[0-9]|20)$/)
    .optional(),

  cursor: objectIdSchema.optional(),
}).strict();

// =====================================
// SAVE OR UNSAVE ADDRESS
// =====================================

router.patch(
  "/p14/saved-addresses/:jobId",

  noCache,
  requireTrustedOrigin,
  requireAuth,
  requireRole("merchant"),
  savedLimiter,

  async (req, res) => {
    const parsedId = objectIdSchema.safeParse(
      req.params.jobId
    );

    const parsedBody = saveSchema.safeParse(
      req.body
    );

    if (!parsedId.success || !parsedBody.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_SAVE_REQUEST",
        message: "Invalid address save request.",
      });
    }

    const addressId = new ObjectId(parsedId.data);

    const ownerId = req.user._id;

    const { saved, revision } = parsedBody.data;

    const collection = getMainDB()
      .collection("address_requests");

    const action = saved
      ? "ADDRESS_SAVE"
      : "ADDRESS_UNSAVE";

    const record = await collection.findOne(
      {
        _id: addressId,
        ownerId,
      },
      {
        projection: {
          _id: 1,
          status: 1,
          revision: 1,
        },
      }
    );

    if (!record) {
      await recordAudit({
        req,
        userId: ownerId,
        targetId: addressId,
        action,
        result: "denied",
      });

      return res.status(404).json({
        success: false,
        code: "ADDRESS_NOT_FOUND",
        message: "Address request was not found.",
      });
    }

    const currentRevision = record.revision ?? 0;

    // Older clients can omit revision only
    // for addresses that have not been edited.
    if (
      (revision === undefined && currentRevision > 0) ||
      (revision !== undefined && revision !== currentRevision)
    ) {
      return res.status(409).json({
        success: false,
        code: "REVISION_CONFLICT",
        message: "The address has changed. Refresh its details.",
      });
    }

    if (saved && record.status !== "confirmed") {
      return res.status(409).json({
        success: false,
        code: "ADDRESS_NOT_CONFIRMED",
        message:
          "Confirm a locality before saving this address.",
      });
    }

    await recordAudit({
      req,
      userId: ownerId,
      targetId: addressId,
      action,
      result: "started",
    });

    const now = new Date();

    const updated = await collection.findOneAndUpdate(
      {
        _id: addressId,
        ownerId,

        revision:
          record.revision === undefined
            ? { $exists: false }
            : record.revision,

        ...(saved
          ? { status: "confirmed" }
          : {}),
      },
      [
        {
          $set: {
            saved,

            savedAt: saved
              ? { $ifNull: ["$savedAt", now] }
              : null,
          },
        },
      ],
      {
        returnDocument: "after",

        projection: {
          _id: 1,
          saved: 1,
          savedAt: 1,
          revision: 1,
        },
      }
    );

    if (!updated) {
      await recordAudit({
        req,
        userId: ownerId,
        targetId: addressId,
        action,
        result: "conflict",
      });

      return res.status(409).json({
        success: false,
        code: "ADDRESS_UPDATE_CONFLICT",
        message:
          "The address changed. Please refresh your results.",
      });
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
      jobId: updated._id.toString(),
      saved: updated.saved,
      savedAt: updated.savedAt || null,
      revision: updated.revision ?? 0,

      message: saved
        ? "Address saved successfully."
        : "Address removed from saved addresses.",
    });
  }
);

// =====================================
// GET SAVED ADDRESSES
// =====================================

router.get(
  "/p14/saved-addresses",

  noCache,
  requireAuth,
  requireRole("merchant"),

  async (req, res) => {
    const parsed = paginationSchema.safeParse(
      req.query
    );

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_SAVED_QUERY",
        message: "Invalid pagination parameters.",
      });
    }

    const limit = Number(
      parsed.data.limit || "10"
    );

    const ownerId = req.user._id;

    const filter = {
      ownerId,
      saved: true,
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

    const items = page.map((record) => {
      const decrypted = decryptData(
        record.encryptedPayload,
        env.ADDRESS_ENCRYPTION_KEY,
        addressAAD(record._id, record.ownerId)
      );

      return {
        jobId: record._id.toString(),

        originalAddress: decrypted.originalAddress,

        status: record.status,

        decision: record.decision || null,

        revision: record.revision ?? 0,

        candidateCount: decrypted.candidates.length,

        selectedCandidate:
          decrypted.selectedCandidate || null,

        requiresConfirmation:
          decrypted.requiresConfirmation,

        saved: true,

        savedAt: record.savedAt || null,

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