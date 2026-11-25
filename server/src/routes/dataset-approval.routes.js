import { Router } from "express";
import { ObjectId } from "mongodb";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { env } from "../config/env.js";

import {
  requireAuth,
  requireRole,
} from "../middleware/auth.middleware.js";

import { recordAudit } from "../services/audit.service.js";

import {
  DatasetApprovalError,
  proposalCollection,
  publicProposal,
  decideDatasetProposal,
} from "../services/dataset-approval.service.js";

const router = Router();

const ADMIN = "/p14/admin/dataset-proposals";
const MANAGER = "/p14/data-manager/dataset-proposals";

function fail(res, status, code, message) {
  return res.status(status).json({
    success: false,
    code,
    message,
  });
}

function noCache(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

function trustedOrigin(req, res, next) {
  if (req.get("Origin") !== env.CLIENT_URL) {
    return fail(
      res,
      403,
      "INVALID_ORIGIN",
      "Request origin is not permitted."
    );
  }

  next();
}

const limiter = rateLimit({
  windowMs: 60000,
  limit: 50,

  keyGenerator: req => String(req.user._id),

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests. Try again later.",
  },
});

const adminAccess = [
  noCache,
  requireAuth,
  requireRole("admin"),
  limiter,
];

const managerAccess = [
  noCache,
  requireAuth,
  requireRole("data_manager"),
  limiter,
];

// =====================================
// INPUT VALIDATION
// =====================================

const kindSchema = z.enum([
  "locality",
  "term",
]);

const idSchema = z.string()
  .regex(/^[a-f0-9]{24}$/i);

const querySchema = z.object({
  status: z.enum([
    "pending",
    "approved",
    "rejected",
    "all",
  ]).optional(),

  limit: z.string()
    .regex(/^\d{1,2}$/)
    .transform(Number)
    .refine(value => value >= 1 && value <= 50)
    .optional(),

  cursor: idSchema.optional(),
}).strict();

const decisionSchema = z.object({
  action: z.enum([
    "approve",
    "reject",
  ]),

  reason: z.string()
    .trim()
    .min(10)
    .max(1000)
    .refine(value => !/[\p{Cc}]/u.test(value)),
}).strict();

// =====================================
// AUDIT HELPER
// =====================================

async function auditDecision(
  req,
  kind,
  action,
  result,
  proposalId
) {
  const auditAction =
    `DATASET_${kind.toUpperCase()}_${action.toUpperCase()}`;

  try {
    await recordAudit({
      req,
      userId: req.user._id,
      action: auditAction,
      result,
      targetId: String(proposalId),
    });
  } catch {
    // The Main DB decision is already durable.
    // Do not report a committed decision as rolled back.

    console.error(
      "[AUDIT] Dataset decision audit delivery failed.",
      String(proposalId)
    );
  }
}

// =====================================
// ADMIN PROPOSAL QUEUE
// =====================================

router.get(
  `${ADMIN}/:kind`,

  ...adminAccess,

  async (req, res) => {
    const kind = kindSchema.safeParse(
      req.params.kind
    );

    const query = querySchema.safeParse(
      req.query
    );

    if (!kind.success || !query.success) {
      return fail(
        res,
        400,
        "INVALID_PROPOSAL_QUERY",
        "Invalid proposal search."
      );
    }

    const {
      status = "pending",
      limit = 20,
      cursor,
    } = query.data;

    const filter = {};

    if (status !== "all") {
      filter.status = status;
    }

    if (cursor) {
      filter._id = {
        $lt: new ObjectId(cursor),
      };
    }

    const records = await proposalCollection(kind.data)
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .maxTimeMS(10000)
      .toArray();

    const hasMore = records.length > limit;

    const items = records.slice(0, limit);

    return res.json({
      success: true,

      items: items.map(
        record => publicProposal(
          kind.data,
          record,
          true
        )
      ),

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

// =====================================
// ADMIN & OWNER PROPOSAL DETAILS
// =====================================

function proposalDetails(admin) {
  return async (req, res) => {
    const kind = kindSchema.safeParse(
      req.params.kind
    );

    const id = idSchema.safeParse(
      req.params.proposalId
    );

    if (
      !kind.success ||
      !id.success ||
      Object.keys(req.query).length > 0
    ) {
      return fail(
        res,
        400,
        "INVALID_PROPOSAL_REQUEST",
        "Invalid proposal request."
      );
    }

    const filter = {
      _id: new ObjectId(id.data),

      ...(admin
        ? {}
        : { requestedBy: req.user._id }),
    };

    const record = await proposalCollection(kind.data)
      .findOne(
        filter,
        { maxTimeMS: 10000 }
      );

    if (!record) {
      return fail(
        res,
        404,
        "PROPOSAL_NOT_FOUND",
        "The proposal was not found."
      );
    }

    return res.json({
      success: true,
      item: publicProposal(kind.data, record, admin),
    });
  };
}

router.get(
  `${ADMIN}/:kind/:proposalId`,

  ...adminAccess,

  proposalDetails(true)
);

router.get(
  `${MANAGER}/:kind/:proposalId`,

  ...managerAccess,

  proposalDetails(false)
);

// =====================================
// APPROVE OR REJECT PROPOSAL
// =====================================

router.post(
  `${ADMIN}/:kind/:proposalId/decision`,

  ...adminAccess,

  trustedOrigin,

  async (req, res) => {
    const kind = kindSchema.safeParse(
      req.params.kind
    );

    const id = idSchema.safeParse(
      req.params.proposalId
    );

    const input = decisionSchema.safeParse(
      req.body
    );

    if (
      !kind.success ||
      !id.success ||
      !input.success ||
      Object.keys(req.query).length > 0
    ) {
      return fail(
        res,
        400,
        "INVALID_PROPOSAL_DECISION",
        "Provide a valid decision and reason."
      );
    }

    const proposalId = new ObjectId(id.data);

    let record;

    try {
      record = await decideDatasetProposal({
        kind: kind.data,

        proposalId,

        adminId: req.user._id,

        action: input.data.action,

        reason: input.data.reason,
      });

    } catch (error) {
      if (error instanceof DatasetApprovalError) {
        await auditDecision(
          req,
          kind.data,
          input.data.action,
          "denied",
          proposalId
        );

        return fail(
          res,
          error.status,
          error.code,
          error.message
        );
      }

      throw error;
    }

    await auditDecision(
      req,
      kind.data,
      input.data.action,
      "success",
      proposalId
    );

    return res.json({
      success: true,

      item: publicProposal(
        kind.data,
        record,
        true
      ),

      message: record.status === "approved"
        ? "Proposal approved and published."
        : "Proposal rejected. Dataset unchanged.",
    });
  }
);

export default router;
