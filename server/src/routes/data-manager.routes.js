import dataManagerDashboardRoutes from "./data-manager-dashboard.routes.js";
import dataManagerEscalationsRoutes from "./data-manager-escalations.routes.js";
import dataManagerTermsRoutes from "./data-manager-terms.routes.js";
import { Router } from "express";
import { ObjectId } from "mongodb";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { env } from "../config/env.js";
import { isTrustedOrigin } from "../utils/mobile-auth.js";

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

const router = Router();

// =====================================
// COMMON SECURITY MIDDLEWARE
// =====================================

function noCache(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

function trustedOrigin(req, res, next) {
  if (!isTrustedOrigin(req, env.CLIENT_URL, env.MOBILE_AUTH_ENABLED)) {
    return res.status(403).json({
      success: false,
      code: "INVALID_ORIGIN",
      message: "Request origin is not permitted.",
    });
  }

  next();
}

const dataManagerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,

  keyGenerator: (req) =>
    String(req.user._id),

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests. Try again later.",
  },
});

router.use(
  "/p14/data-manager",
  noCache,
  requireAuth,
  requireRole("data_manager"),
  dataManagerLimiter
);

// =====================================
// VALIDATION SCHEMAS
// =====================================

const localityIdSchema = z
  .string()
  .trim()
  .min(4)
  .max(128)
  .regex(/^[A-Z0-9-]+$/);

const limitSchema = z
  .string()
  .regex(/^\d{1,2}$/)
  .transform(Number)
  .refine((value) =>
    value >= 1 && value <= 50
  );

const localityQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),

    approved: z
      .enum(["true", "false", "all"])
      .optional(),

    cursor: localityIdSchema.optional(),

    limit: limitSchema.optional(),
  })
  .strict();

const proposalQuerySchema = z
  .object({
    cursor: z
      .string()
      .regex(/^[a-f0-9]{24}$/i)
      .optional(),

    limit: limitSchema.optional(),
  })
  .strict();

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (value) => !/[\p{Cc}]/u.test(value),
    "Control characters are not allowed."
  );

const localitySchema = z
  .object({
    nameEn: nameSchema,
    nameBn: nameSchema,

    areaEn: nameSchema,
    areaBn: nameSchema,

    districtEn: nameSchema,
    districtBn: nameSchema,

    divisionEn: nameSchema,
    divisionBn: nameSchema,
  })
  .strict();

const proposalSchema = z
  .object({
    operation: z.enum([
      "create",
      "update",
    ]),

    localityId: localityIdSchema,

    locality: localitySchema,

    reason: z
      .string()
      .trim()
      .min(10)
      .max(1000),

    evidence: z
      .string()
      .trim()
      .min(5)
      .max(500),
  })
  .strict();

// =====================================
// RESPONSE HELPERS
// =====================================

function fail(res, status, code, message) {
  return res.status(status).json({
    success: false,
    code,
    message,
  });
}

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function normalizeSearch(value) {
  return value
    .normalize("NFKC")
    .replace(/[০-৯]/g, (digit) =>
      String("০১২৩৪৫৬৭৮৯".indexOf(digit))
    )
    .trim();
}

function localitySnapshot(record) {
  return {
    nameEn: record.nameEn ?? "",
    nameBn: record.nameBn ?? "",

    areaEn: record.areaEn ?? "",
    areaBn: record.areaBn ?? "",

    districtEn: record.districtEn ?? "",
    districtBn: record.districtBn ?? "",

    divisionEn: record.divisionEn ?? "",
    divisionBn: record.divisionBn ?? "",
  };
}

function publicLocality(record) {
  return {
    localityId: record.id,

    locality: localitySnapshot(record),

    approved: record.approved === true,

    aliases: record.aliases ?? [],

    areaAliases: record.areaAliases ?? [],

    districtAliases:
      record.districtAliases ?? [],

    landmarks: record.landmarks ?? [],

    source: record.source ?? null,

    precision: record.precision ?? null,

    updatedAt: record.updatedAt ?? null,
  };
}

function publicProposal(record) {
  return {
    proposalId: String(record._id),

    operation: record.operation,

    localityId: record.localityId,

    locality: record.locality,

    reason: record.reason,

    evidence: record.evidence,

    status: record.status,

    createdAt: record.createdAt,

    updatedAt: record.updatedAt,
  };
}

// =====================================
// GET APPROVED / UNAPPROVED LOCALITIES
// =====================================

router.get(
  "/p14/data-manager/localities",

  async (req, res) => {
    const parsed =
      localityQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return fail(
        res,
        400,
        "INVALID_LOCALITY_QUERY",
        "Invalid locality search or pagination options."
      );
    }

    const {
      q,
      approved = "all",
      cursor,
      limit = 20,
    } = parsed.data;

    const filter = {};

    if (approved !== "all") {
      filter.approved =
        approved === "true";
    }

    if (cursor) {
      filter.id = {
        $gt: cursor,
      };
    }

    if (q) {
      const search = new RegExp(
        escapeRegex(normalizeSearch(q)).replace(
        /[0-9]/g,
        (digit) => "[" + digit + "০১২৩৪৫৬৭৮৯"[Number(digit)] + "]"
      ),
        "i"
      );

      filter.$or = [
        { id: search },

        { nameEn: search },
        { nameBn: search },

        { areaEn: search },
        { areaBn: search },

        { districtEn: search },
        { districtBn: search },

        { divisionEn: search },
        { divisionBn: search },

        { aliases: search },
        { areaAliases: search },
        { districtAliases: search },
      ];
    }

    const collection = getMainDB()
      .collection("localities");

    const records = await collection
      .find(filter)
      .sort({ id: 1 })
      .limit(limit + 1)
      .maxTimeMS(10000)
      .toArray();

    const hasMore =
      records.length > limit;

    const items = records.slice(0, limit);

    return res.json({
      success: true,

      items: items.map(publicLocality),

      pagination: {
        limit,

        hasMore,

        nextCursor: hasMore
          ? items.at(-1).id
          : null,
      },
    });
  }
);

// =====================================
// GET SINGLE LOCALITY DETAILS
// =====================================

router.get(
  "/p14/data-manager/localities/:id",

  async (req, res) => {
    const parsed = localityIdSchema
      .safeParse(req.params.id);

    if (!parsed.success) {
      return fail(
        res,
        400,
        "INVALID_LOCALITY_ID",
        "Invalid locality ID."
      );
    }

    const record = await getMainDB()
      .collection("localities")
      .findOne({
        id: parsed.data,
      });

    if (!record) {
      return fail(
        res,
        404,
        "LOCALITY_NOT_FOUND",
        "Locality was not found."
      );
    }

    return res.json({
      success: true,

      item: publicLocality(record),
    });
  }
);

// =====================================
// CREATE LOCALITY CHANGE PROPOSAL
// =====================================

router.post(
  "/p14/data-manager/locality-proposals",

  trustedOrigin,

  async (req, res) => {
    const parsed =
      proposalSchema.safeParse(req.body);

    if (!parsed.success) {
      return fail(
        res,
        400,
        "INVALID_LOCALITY_PROPOSAL",
        "Provide valid locality information, reason and evidence."
      );
    }

    const input = parsed.data;

    const db = getMainDB();

    const localities =
      db.collection("localities");

    const proposals =
      db.collection("locality_proposals");

    const existing = await localities.findOne({
      id: input.localityId,
    });

    // Prevent proposing a duplicate ID.

    if (
      input.operation === "create" &&
      existing
    ) {
      return fail(
        res,
        409,
        "LOCALITY_ALREADY_EXISTS",
        "A locality with this ID already exists."
      );
    }

    // Updates require an existing locality.

    if (
      input.operation === "update" &&
      !existing
    ) {
      return fail(
        res,
        404,
        "LOCALITY_NOT_FOUND",
        "The locality to update was not found."
      );
    }

    const now = new Date();

    const proposalId = new ObjectId();

    const proposal = {
      _id: proposalId,

      requestedBy: req.user._id,

      operation: input.operation,

      localityId: input.localityId,

      locality: input.locality,

      // Existing values are retained for
      // future approval conflict detection.

      baseLocality: existing
        ? localitySnapshot(existing)
        : null,

      baseUpdatedAt: existing
        ? existing.updatedAt ?? null
        : null,

      reason: input.reason,

      evidence: input.evidence,

      status: "pending",

      createdAt: now,

      updatedAt: now,
    };

    await recordAudit({
      req,

      userId: req.user._id,

      action: "LOCALITY_PROPOSAL_CREATE",

      result: "started",

      targetId: String(proposalId),
    });

    await proposals.insertOne(proposal);

    await recordAudit({
      req,

      userId: req.user._id,

      action: "LOCALITY_PROPOSAL_CREATE",

      result: "success",

      targetId: String(proposalId),
    });

    return res.status(201).json({
      success: true,

      item: publicProposal(proposal),

      message:
        "Locality proposal submitted for approval.",
    });
  }
);

// =====================================
// GET OWN LOCALITY PROPOSALS
// =====================================

router.get(
  "/p14/data-manager/locality-proposals",

  async (req, res) => {
    const parsed =
      proposalQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return fail(
        res,
        400,
        "INVALID_PROPOSAL_QUERY",
        "Invalid proposal pagination options."
      );
    }

    const {
      cursor,
      limit = 20,
    } = parsed.data;

    const filter = {
      requestedBy: req.user._id,
    };

    if (cursor) {
      filter._id = {
        $lt: new ObjectId(cursor),
      };
    }

    const records = await getMainDB()
      .collection("locality_proposals")
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .maxTimeMS(10000)
      .toArray();

    const hasMore =
      records.length > limit;

    const items = records.slice(0, limit);

    return res.json({
      success: true,

      items: items.map(publicProposal),

      pagination: {
        limit,

        hasMore,

        nextCursor: hasMore
          ? String(items.at(-1)._id)
          : null,
      },
    });
  }
);

router.use(dataManagerTermsRoutes);

router.use(dataManagerEscalationsRoutes);

router.use(dataManagerDashboardRoutes);

export default router;