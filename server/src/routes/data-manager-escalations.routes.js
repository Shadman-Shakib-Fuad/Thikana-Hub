import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { getMainDB } from "../config/database.js";
import { recordAudit } from "../services/audit.service.js";

const router = Router();

const BASE = "/p14/data-manager/escalations";

// Authentication, authorization and rate limiting
// are inherited from the parent Data Manager router.

// =====================================
// VALIDATION
// =====================================

const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i);

const querySchema = z.object({
  limit: z
    .string()
    .regex(/^\d{1,2}$/)
    .transform(Number)
    .refine(value => value >= 1 && value <= 50)
    .optional(),

  cursor: objectIdSchema.optional(),

  jobId: objectIdSchema.optional(),
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

function collection() {
  return getMainDB().collection("address_requests");
}

function escalationFilter() {
  return {
    decision: "review_requested",
    "reviewAssignment.status": "escalated",
  };
}

// Retrieve metadata only.
// Never retrieve private encrypted address content.

const projection = {
  _id: 1,
  revision: 1,
  status: 1,
  createdAt: 1,
  updatedAt: 1,

  "reviewAssignment.assignedAt": 1,
  "reviewAssignment.decidedAt": 1,
};

function publicEscalation(record) {
  return {
    jobId: String(record._id),

    revision: record.revision ?? 0,

    addressStatus: record.status,

    reviewStatus: "escalated",

    assignedAt:
      record.reviewAssignment?.assignedAt ?? null,

    escalatedAt:
      record.reviewAssignment?.decidedAt ?? null,

    createdAt: record.createdAt ?? null,

    updatedAt: record.updatedAt ?? null,
  };
}

// =====================================
// ESCALATION STATISTICS
// =====================================

router.get(
  `${BASE}/statistics`,

  async (req, res) => {
    if (Object.keys(req.query).length > 0) {
      return fail(
        res,
        400,
        "INVALID_ESCALATION_QUERY",
        "Statistics do not accept query parameters."
      );
    }

    const totalEscalated = await collection()
      .countDocuments(
        escalationFilter(),
        { maxTimeMS: 10000 }
      );

    return res.json({
      success: true,

      summary: {
        totalEscalated,
      },

      generatedAt: new Date().toISOString(),
    });
  }
);

// =====================================
// ESCALATION QUEUE
// =====================================

router.get(
  BASE,

  async (req, res) => {
    const parsed = querySchema.safeParse(req.query);

    if (!parsed.success) {
      return fail(
        res,
        400,
        "INVALID_ESCALATION_QUERY",
        "Invalid escalation search or pagination."
      );
    }

    const {
      limit = 20,
      cursor,
      jobId,
    } = parsed.data;

    if (jobId && cursor) {
      return fail(
        res,
        400,
        "INVALID_ESCALATION_QUERY",
        "Use either a job ID or a pagination cursor."
      );
    }

    const filter = escalationFilter();

    if (jobId) {
      filter._id = new ObjectId(jobId);

    } else if (cursor) {
      filter._id = {
        $lt: new ObjectId(cursor),
      };
    }

    const records = await collection()
      .find(filter, { projection })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .maxTimeMS(10000)
      .toArray();

    const hasMore = records.length > limit;
    const items = records.slice(0, limit);

    return res.json({
      success: true,

      items: items.map(publicEscalation),

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
// ESCALATION DETAILS
// =====================================

router.get(
  `${BASE}/:jobId`,

  async (req, res) => {
    const parsed = objectIdSchema.safeParse(
      req.params.jobId
    );

    if (!parsed.success) {
      return fail(
        res,
        400,
        "INVALID_JOB_ID",
        "Invalid request ID."
      );
    }

    if (Object.keys(req.query).length > 0) {
      return fail(
        res,
        400,
        "INVALID_ESCALATION_QUERY",
        "Unexpected query parameters."
      );
    }

    const jobId = new ObjectId(parsed.data);

    const record = await collection().findOne(
      {
        ...escalationFilter(),
        _id: jobId,
      },
      {
        projection,
        maxTimeMS: 10000,
      }
    );

    await recordAudit({
      req,

      userId: req.user._id,

      action: "DATA_MANAGER_ESCALATION_ACCESS",

      targetId: String(jobId),

      result: record ? "success" : "denied",
    });

    if (!record) {
      return fail(
        res,
        404,
        "ESCALATION_NOT_FOUND",
        "An active escalated request was not found."
      );
    }

    return res.json({
      success: true,
      item: publicEscalation(record),
    });
  }
);

export default router;
