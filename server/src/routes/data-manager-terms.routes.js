import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { env } from "../config/env.js";
import { isTrustedOrigin } from "../utils/mobile-auth.js";
import { getMainDB } from "../config/database.js";
import { recordAudit } from "../services/audit.service.js";

const router = Router();

const BASE = "/p14/data-manager";
const COLLECTION = "locality_term_proposals";

const TERM_FIELDS = [
  "aliases",
  "areaAliases",
  "districtAliases",
  "landmarks",
];

// Authentication, authorization and rate limiting
// are inherited from data-manager.routes.js.

// =====================================
// BANGLA & ENGLISH NORMALIZATION
// =====================================

function normalizeTerm(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[০-৯]/g, digit =>
      String("০১২৩৪৫৬৭৮৯".indexOf(digit))
    )
    .replace(/\p{Cf}/gu, "")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

// =====================================
// INPUT VALIDATION
// =====================================

const localityIdSchema = z
  .string()
  .trim()
  .min(4)
  .max(128)
  .regex(/^[A-Z0-9-]+$/);

const termSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    value => !/[\p{Cc}]/u.test(value),
    "Control characters are not allowed."
  )
  .refine(
    value => /[\p{L}\p{N}]/u.test(normalizeTerm(value)),
    "A meaningful term is required."
  );

const proposalSchema = z.object({
  localityId: localityIdSchema,

  field: z.enum([
    "aliases",
    "areaAliases",
    "districtAliases",
    "landmarks",
  ]),

  operation: z.enum([
    "add",
    "remove",
  ]),

  term: termSchema,

  reason: z.string().trim().min(10).max(1000),

  evidence: z.string().trim().min(5).max(500),

}).strict();

const querySchema = z.object({
  cursor: z.string()
    .regex(/^[a-f0-9]{24}$/i)
    .optional(),

  limit: z.string()
    .regex(/^\d{1,2}$/)
    .transform(Number)
    .refine(value => value >= 1 && value <= 50)
    .optional(),

  status: z.enum([
    "pending",
    "approved",
    "rejected",
  ]).optional(),

}).strict();

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

function trustedOrigin(req, res, next) {
  if (!isTrustedOrigin(req, env.CLIENT_URL, env.MOBILE_AUTH_ENABLED)) {
    return fail(
      res,
      403,
      "INVALID_ORIGIN",
      "Request origin is not permitted."
    );
  }

  next();
}

function isStringArray(value) {
  return (
    Array.isArray(value) &&
    value.every(item => typeof item === "string")
  );
}

function publicProposal(record) {
  return {
    proposalId: String(record._id),
    localityId: record.localityId,
    field: record.field,
    operation: record.operation,
    term: record.term,
    reason: record.reason,
    evidence: record.evidence,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// =====================================
// DATABASE INDEXES
// =====================================

let indexPromise = null;

function ensureTermProposalIndexes() {
  if (!indexPromise) {
    const collection = getMainDB()
      .collection(COLLECTION);

    indexPromise = Promise.all([
      collection.createIndex(
        {
          localityId: 1,
          field: 1,
          normalizedTerm: 1,
        },
        {
          name: "unique_pending_term_proposal",
          unique: true,
          partialFilterExpression: {
            status: "pending",
          },
        }
      ),

      collection.createIndex(
        {
          requestedBy: 1,
          _id: -1,
        },
        {
          name: "term_proposal_owner_history",
        }
      ),
    ]).catch(error => {
      indexPromise = null;
      throw error;
    });
  }

  return indexPromise;
}

// =====================================
// GET LOCALITY TERMS
// =====================================

router.get(
  `${BASE}/localities/:id/terms`,

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

    const locality = await getMainDB()
      .collection("localities")
      .findOne({
        id: parsed.data,
        approved: true,
      });

    if (!locality) {
      return fail(
        res,
        404,
        "LOCALITY_NOT_FOUND",
        "Approved locality was not found."
      );
    }

    const fields = TERM_FIELDS.map(field => ({
      field,

      supported: isStringArray(locality[field]),

      items: isStringArray(locality[field])
        ? locality[field]
        : [],
    }));

    return res.json({
      success: true,
      localityId: locality.id,
      nameEn: locality.nameEn ?? "",
      nameBn: locality.nameBn ?? "",
      fields,
    });
  }
);

// =====================================
// CREATE TERM CHANGE PROPOSAL
// =====================================

router.post(
  `${BASE}/term-proposals`,

  trustedOrigin,

  async (req, res) => {
    const parsed = proposalSchema.safeParse(req.body);

    if (!parsed.success) {
      return fail(
        res,
        400,
        "INVALID_TERM_PROPOSAL",
        "Provide a valid term, operation, reason and evidence."
      );
    }

    const input = parsed.data;

    const db = getMainDB();

    const localities = db.collection("localities");
    const proposals = db.collection(COLLECTION);

    const locality = await localities.findOne({
      id: input.localityId,
      approved: true,
    });

    if (!locality) {
      return fail(
        res,
        404,
        "LOCALITY_NOT_FOUND",
        "Approved locality was not found."
      );
    }

    const existingTerms = locality[input.field];

    // Never modify an incompatible dataset format.

    if (!isStringArray(existingTerms)) {
      return fail(
        res,
        409,
        "UNSUPPORTED_TERM_FORMAT",
        "This dataset field requires a compatible data format."
      );
    }

    const normalizedTerm = normalizeTerm(input.term);

    const matches = existingTerms.filter(
      term => normalizeTerm(term) === normalizedTerm
    );

    // Existing duplicate protection.

    if (
      input.operation === "add" &&
      matches.length > 0
    ) {
      return fail(
        res,
        409,
        "TERM_ALREADY_EXISTS",
        "An equivalent term already exists."
      );
    }

    // Verify term exists before proposing removal.

    if (
      input.operation === "remove" &&
      matches.length === 0
    ) {
      return fail(
        res,
        404,
        "TERM_NOT_FOUND",
        "The term to remove was not found."
      );
    }

    if (
      input.operation === "remove" &&
      matches.length > 1
    ) {
      return fail(
        res,
        409,
        "AMBIGUOUS_EXISTING_TERM",
        "Multiple equivalent terms require manual inspection."
      );
    }

    await ensureTermProposalIndexes();

    const now = new Date();

    const proposal = {
      _id: new ObjectId(),

      requestedBy: req.user._id,

      localityId: locality.id,

      field: input.field,

      operation: input.operation,

      term: input.operation === "remove"
        ? matches[0]
        : input.term.normalize("NFKC").trim(),

      normalizedTerm,

      // Preserve original dataset state for
      // future approval conflict detection.

      baseTerms: [...existingTerms],

      baseLocalityDocumentId: locality._id,

      baseUpdatedAt: locality.updatedAt ?? null,

      reason: input.reason,

      evidence: input.evidence,

      status: "pending",

      createdAt: now,

      updatedAt: now,
    };

    async function audit(result) {
      await recordAudit({
        req,
        userId: req.user._id,
        action: "LOCALITY_TERM_PROPOSAL_CREATE",
        result,
        targetId: String(proposal._id),
      });
    }

    await audit("started");

    try {
      await proposals.insertOne(proposal);

    } catch (error) {
      // MongoDB unique index prevents duplicate
      // proposals even during concurrent requests.

      if (error?.code === 11000) {
        await audit("conflict");

        return fail(
          res,
          409,
          "PENDING_TERM_PROPOSAL_EXISTS",
          "A pending proposal already exists for this term."
        );
      }

      await audit("failure");

      throw error;
    }

    await audit("success");

    return res.status(201).json({
      success: true,

      item: publicProposal(proposal),

      message: "Term change proposal submitted for approval.",
    });
  }
);

// =====================================
// GET OWN TERM PROPOSALS
// =====================================

router.get(
  `${BASE}/term-proposals`,

  async (req, res) => {
    const parsed = querySchema.safeParse(req.query);

    if (!parsed.success) {
      return fail(
        res,
        400,
        "INVALID_TERM_PROPOSAL_QUERY",
        "Invalid proposal filtering or pagination."
      );
    }

    const {
      cursor,
      limit = 20,
      status,
    } = parsed.data;

    const filter = {
      requestedBy: req.user._id,
    };

    if (status) {
      filter.status = status;
    }

    if (cursor) {
      filter._id = {
        $lt: new ObjectId(cursor),
      };
    }

    const records = await getMainDB()
      .collection(COLLECTION)
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .maxTimeMS(10000)
      .toArray();

    const hasMore = records.length > limit;

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

export default router;