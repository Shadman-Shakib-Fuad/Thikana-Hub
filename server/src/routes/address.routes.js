import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import rateLimit from "express-rate-limit";

import { env } from "../config/env.js";

import {
  getMainDB,
} from "../config/database.js";

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
  if (req.get("Origin") !== env.CLIENT_URL) {
    return res.status(403).json({
      success: false,
      code: "UNTRUSTED_ORIGIN",
      message: "Request origin is not allowed.",
    });
  }

  next();
}

// =====================================
// SEARCH RATE LIMIT
// =====================================

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,

  limit: 20,

  standardHeaders: true,

  legacyHeaders: false,

  keyGenerator: (req) =>
    String(req.user._id),

  message: {
    success: false,
    code: "SEARCH_RATE_LIMIT",
    message:
      "Too many searches. Please try again later.",
  },
});

// =====================================
// INPUT VALIDATION
// =====================================

const addressSchema = z
  .object({
    address: z.string().min(1).max(300),
  })
  .strict();

// =====================================
// ADDRESS RESOLUTION
// =====================================

router.post(
  "/p14/address-resolutions",

  noCache,

  requireTrustedOrigin,

  requireAuth,

  requireRole("merchant"),

  searchLimiter,

  async (req, res) => {
    const parsed = addressSchema.safeParse(
      req.body
    );

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ADDRESS",
        message:
          "Please enter an address between 1 and 300 characters.",
      });
    }

    const address = parsed.data.address;

    const validation = validateAddress(
      address
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ADDRESS",
        message: validation.message,
      });
    }

    const db = getMainDB();

    // Load approved locality data
    const localities = await db
      .collection("localities")
      .find(
        { approved: true },
        {
          projection: {
            _id: 0,
          },
        }
      )
      .limit(MAX_LOCALITIES + 1)
      .toArray();

    if (localities.length === 0) {
      return res.status(503).json({
        success: false,
        code: "DATASET_UNAVAILABLE",
        message:
          "Address reference data is unavailable.",
      });
    }

    if (localities.length > MAX_LOCALITIES) {
      return res.status(503).json({
        success: false,
        code: "DATASET_LIMIT",
        message:
          "The search service requires a dataset update.",
      });
    }

    // Run matching algorithm
    const result = resolveAddress(
      address,
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

    const addressId = new ObjectId();

    const ownerId = req.user._id;

    // Encrypt private input and candidates
    const encryptedPayload = encryptData(
      {
        originalAddress: address,

        candidates,

        ambiguous: result.ambiguous,

        requiresConfirmation:
          result.requiresConfirmation,
      },

      env.ADDRESS_ENCRYPTION_KEY,

      addressAAD(addressId, ownerId)
    );

    const createdAt = new Date();

    await recordAudit({
      req,
      userId: ownerId,
      targetId: addressId,
      action: "ADDRESS_SEARCH",
      result: "started",
    });

    // Save encrypted address
    await db
      .collection("address_requests")
      .insertOne({
        _id: addressId,

        ownerId,

        encryptedPayload,

        status: result.status,

        createdAt,

        updatedAt: createdAt,
      });

    // Record security event
    await recordAudit({
      req,
      userId: ownerId,
      targetId: addressId,
      action: "ADDRESS_SEARCH",
      result: "success",
    });

    return res.status(201).json({
      success: true,

      jobId: addressId.toString(),

      status: result.status,

      message: result.message,

      requiresConfirmation:
        result.requiresConfirmation,

      ambiguous: result.ambiguous,

      candidates,

      createdAt,
    });
  }
);

// =====================================
// READ OWN ADDRESS REQUEST
// =====================================

router.get(
  "/jobs/:jobId",

  noCache,

  requireAuth,

  requireRole("merchant"),

  async (req, res) => {
    const { jobId } = req.params;

    if (!/^[a-f0-9]{24}$/i.test(jobId)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ID",
        message: "Invalid address request ID.",
      });
    }

    const record = await getMainDB()
      .collection("address_requests")
      .findOne({
        _id: new ObjectId(jobId),

        // Server-side ownership check
        ownerId: req.user._id,
      });

    if (!record) {
      await recordAudit({
        req,
        userId: req.user._id,
        targetId: new ObjectId(jobId),
        action: "ADDRESS_ACCESS",
        result: "denied",
      });

      return res.status(404).json({
        success: false,
        code: "ADDRESS_NOT_FOUND",
        message:
          "Address request was not found.",
      });
    }

    const decrypted = decryptData(
      record.encryptedPayload,

      env.ADDRESS_ENCRYPTION_KEY,

      addressAAD(
        record._id,
        record.ownerId
      )
    );

    return res.status(200).json({
      success: true,

      jobId: record._id.toString(),

      status: record.status,

      originalAddress:
        decrypted.originalAddress,

      decision: record.decision || null,

      revision: record.revision ?? 0,

      saved: record.saved === true,

      savedAt: record.savedAt || null,

      selectedCandidate:
        decrypted.selectedCandidate || null,

      candidates:
        decrypted.candidates,

      ambiguous:
        decrypted.ambiguous,

      requiresConfirmation:
        decrypted.requiresConfirmation,

      createdAt: record.createdAt,

      updatedAt: record.updatedAt,
    });
  }
);

export default router;