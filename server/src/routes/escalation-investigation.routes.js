import { Router } from "express";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import rateLimit from "express-rate-limit";
import { z } from "zod";

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
  encryptData,
  decryptData,
  addressAAD,
} from "../services/escalation-crypto.service.js";

const router = Router();

const BASE =
  "/p14/data-manager/escalations";

// =====================================
// SECURITY MIDDLEWARE
// =====================================

function noCache(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

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

const limiter = rateLimit({
  windowMs: 60000,
  limit: 30,

  keyGenerator: req => String(req.user._id),

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests. Try again later.",
  },
});

const managerAccess = [
  noCache,
  requireAuth,
  requireRole("data_manager"),
  limiter,
];

const reviewerAccess = [
  noCache,
  requireAuth,
  requireRole("reviewer"),
  limiter,
];

// =====================================
// INPUT VALIDATION
// =====================================

const idSchema = z.string()
  .regex(/^[a-f0-9]{24}$/i);

const handoffSchema = z.object({
  revision: z.number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER),

  version: z.string()
    .regex(/^[a-f0-9]{64}$/),

  note: z.string()
    .trim()
    .min(10)
    .max(1000)
    .refine(
      value => !/[\p{Cc}]/u.test(
        value.replace(/[\r\n\t]/g, "")
      ),
      "Invalid control character."
    ),
}).strict();

// =====================================
// DATABASE HELPERS
// =====================================

function addresses() {
  return getMainDB()
    .collection("address_requests");
}

function activeEscalation(id) {
  return {
    _id: id,

    decision: "review_requested",

    "reviewAssignment.status": "escalated",
  };
}

function isoDate(value) {
  if (value == null) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function assignmentVersion(record) {
  return isoDate(
    record.reviewAssignment?.assignedAt
  );
}

function escalationVersion(record) {
  return createHash("sha256")
    .update(JSON.stringify([
      String(record._id),

      record.revision ?? 0,

      assignmentVersion(record),

      record.encryptedPayload?.iv,
    ]))
    .digest("hex");
}

function revisionFilter(record) {
  return record.revision === undefined
    ? { revision: { $exists: false } }
    : { revision: record.revision };
}

async function audit(req, action, result, id) {
  await recordAudit({
    req,
    userId: req.user._id,
    action,
    result,
    targetId: String(id),
  });
}

// =====================================
// DECRYPT AND VALIDATE ESCALATION
// =====================================

async function readEscalation(record) {
  const payload = await decryptData(
    record.encryptedPayload,

    env.ADDRESS_ENCRYPTION_KEY,

    addressAAD(record._id, record.ownerId)
  );

  const assignment = record.reviewAssignment;
  const outcome = payload?.reviewOutcome;

  const version = assignmentVersion(record);

  const valid =
    assignment?.status === "escalated" &&
    version !== null &&
    isoDate(assignment.decidedAt) !== null &&
    typeof record.encryptedPayload?.iv === "string" &&
    typeof payload?.originalAddress === "string" &&
    outcome?.decision === "escalated" &&
    outcome.addressRevision === (record.revision ?? 0) &&
    outcome.assignmentVersion === version &&
    String(outcome.reviewerId) ===
      String(assignment.reviewerId) &&
    typeof outcome.note === "string" &&
    outcome.recommendation == null;

  return valid ? { payload, outcome } : null;
}

function conflict(res) {
  return fail(
    res,
    409,
    "ESCALATION_STATE_CONFLICT",
    "The escalation has changed. Refresh and try again."
  );
}

// =====================================
// SECURE INVESTIGATION DETAILS
// =====================================

router.get(
  `${BASE}/:jobId/investigation`,

  ...managerAccess,

  async (req, res) => {
    const parsed = idSchema.safeParse(
      req.params.jobId
    );

    if (
      !parsed.success ||
      Object.keys(req.query).length !== 0
    ) {
      return fail(
        res,
        400,
        "INVALID_INVESTIGATION_REQUEST",
        "Invalid investigation request."
      );
    }

    const id = new ObjectId(parsed.data);

    const record = await addresses().findOne(
      activeEscalation(id),
      { maxTimeMS: 10000 }
    );

    if (!record) {
      await audit(
        req,
        "ESCALATION_INVESTIGATION_ACCESS",
        "denied",
        id
      );

      return fail(
        res,
        404,
        "ESCALATION_NOT_FOUND",
        "Active escalation was not found."
      );
    }

    const detail = await readEscalation(record);

    if (!detail) {
      return conflict(res);
    }

    // Verify the record has not been reassigned
    // while its encrypted payload was being read.

    const stillActive = await addresses().findOne(
      {
        ...activeEscalation(id),

        ...revisionFilter(record),

        "reviewAssignment.assignedAt":
          record.reviewAssignment.assignedAt,

        "encryptedPayload.iv":
          record.encryptedPayload.iv,
      },

      { projection: { _id: 1 } }
    );

    if (!stillActive) {
      return conflict(res);
    }

    await audit(
      req,
      "ESCALATION_INVESTIGATION_ACCESS",
      "success",
      id
    );

    return res.json({
      success: true,

      item: {
        jobId: String(record._id),

        revision: record.revision ?? 0,

        version: escalationVersion(record),

        originalAddress:
          detail.payload.originalAddress,

        reviewerNote:
          detail.outcome.note,

        escalatedAt:
          record.reviewAssignment.decidedAt,

        reviewStatus: "escalated",
      },
    });
  }
);

// =====================================
// HANDOFF TO THE EXISTING REVIEWER
// =====================================

router.post(
  `${BASE}/:jobId/handoff`,

  ...managerAccess,

  trustedOrigin,

  async (req, res) => {
    const idResult = idSchema.safeParse(
      req.params.jobId
    );

    const parsed = handoffSchema.safeParse(
      req.body
    );

    if (
      !idResult.success ||
      !parsed.success ||
      Object.keys(req.query).length !== 0
    ) {
      return fail(
        res,
        400,
        "INVALID_HANDOFF_REQUEST",
        "Invalid handoff information."
      );
    }

    const id = new ObjectId(idResult.data);
    const input = parsed.data;

    const record = await addresses().findOne(
      activeEscalation(id)
    );

    if (!record) {
      return fail(
        res,
        404,
        "ESCALATION_NOT_FOUND",
        "Active escalation was not found."
      );
    }

    if (
      input.revision !== (record.revision ?? 0) ||
      input.version !== escalationVersion(record)
    ) {
      return conflict(res);
    }

    const detail = await readEscalation(record);

    if (!detail) {
      return conflict(res);
    }

    const { payload, outcome } = detail;

    const previous = record.reviewAssignment;

    const reviewer = await getMainDB()
      .collection("users")
      .findOne(
        {
          _id: previous.reviewerId,

          role: "reviewer",

          status: "active",
        },

        { projection: { _id: 1 } }
      );

    if (!reviewer) {
      return fail(
        res,
        409,
        "REVIEWER_NOT_AVAILABLE",
        "The previous reviewer is not available."
      );
    }

    if (
      (
        record.reviewHistory !== undefined &&
        !Array.isArray(record.reviewHistory)
      ) ||
      (
        payload.reviewOutcomeHistory !== undefined &&
        !Array.isArray(payload.reviewOutcomeHistory)
      )
    ) {
      return conflict(res);
    }

    const now = new Date(
      Math.max(
        Date.now(),
        new Date(previous.assignedAt).getTime() + 1
      )
    );

    const newVersion = now.toISOString();

    // Preserve earlier reviewer outcome.
    // Investigation note remains encrypted.

    const archivedOutcome = {
      ...outcome,

      dataManagerHandoff: {
        managerId: String(req.user._id),

        note: input.note,

        handedOffAt: newVersion,

        newAssignmentVersion: newVersion,
      },
    };

    const nextPayload = {
      ...payload,

      reviewOutcomeHistory: [
        ...(payload.reviewOutcomeHistory ?? []),
        archivedOutcome,
      ].slice(-20),
    };

    // Remove the old active escalation outcome.
    // A new reviewer decision is required.

    delete nextPayload.reviewOutcome;

    const encryptedPayload = await encryptData(
      nextPayload,

      env.ADDRESS_ENCRYPTION_KEY,

      addressAAD(record._id, record.ownerId)
    );

    if (
      !encryptedPayload?.iv ||
      encryptedPayload.iv === record.encryptedPayload.iv
    ) {
      throw new Error("Encryption IV validation failed.");
    }

    const historyEntry = {
      reviewerId: previous.reviewerId,

      status: "escalated",

      assignedAt: previous.assignedAt,

      decidedAt: previous.decidedAt,

      addressRevision: record.revision ?? 0,

      handedOffAt: now,
    };

    await audit(
      req,
      "ESCALATION_REVIEWER_HANDOFF",
      "started",
      id
    );

    // Atomic compare-and-update protects against
    // concurrent or outdated handoff attempts.

    const updated = await addresses().updateOne(
      {
        ...activeEscalation(id),

        ...revisionFilter(record),

        ownerId: record.ownerId,

        "reviewAssignment.reviewerId":
          previous.reviewerId,

        "reviewAssignment.assignedAt":
          previous.assignedAt,

        "reviewAssignment.decidedAt":
          previous.decidedAt,

        "encryptedPayload.iv":
          record.encryptedPayload.iv,
      },

      {
        $set: {
          encryptedPayload,

          reviewAssignment: {
            reviewerId: reviewer._id,

            status: "pending",

            assignedAt: now,
          },

          updatedAt: now,
        },

        $push: {
          reviewHistory: {
            $each: [historyEntry],

            $slice: -20,
          },
        },
      }
    );

    if (updated.modifiedCount !== 1) {
      await audit(
        req,
        "ESCALATION_REVIEWER_HANDOFF",
        "conflict",
        id
      );

      return conflict(res);
    }

    await audit(
      req,
      "ESCALATION_REVIEWER_HANDOFF",
      "success",
      id
    );

    return res.json({
      success: true,

      jobId: String(id),

      revision: record.revision ?? 0,

      reviewStatus: "pending",

      assignedAt: newVersion,

      message:
        "Request returned to reviewer for a new decision.",
    });
  }
);

// =====================================
// REVIEWER HANDOFF CONTEXT
// =====================================

router.get(
  "/p14/reviewer/queue/:jobId/handoff-context",

  ...reviewerAccess,

  async (req, res) => {
    const parsed = idSchema.safeParse(
      req.params.jobId
    );

    if (
      !parsed.success ||
      Object.keys(req.query).length !== 0
    ) {
      return fail(
        res,
        400,
        "INVALID_HANDOFF_CONTEXT_REQUEST",
        "Invalid review context request."
      );
    }

    const id = new ObjectId(parsed.data);

    const filter = {
      _id: id,

      decision: "review_requested",

      "reviewAssignment.reviewerId":
        req.user._id,

      "reviewAssignment.status": "pending",
    };

    const record = await addresses().findOne(
      filter
    );

    if (!record) {
      return fail(
        res,
        404,
        "REVIEW_NOT_FOUND",
        "Assigned pending review was not found."
      );
    }

    const payload = await decryptData(
      record.encryptedPayload,

      env.ADDRESS_ENCRYPTION_KEY,

      addressAAD(record._id, record.ownerId)
    );

    const history = payload.reviewOutcomeHistory;

    const previous = Array.isArray(history)
      ? history.at(-1)
      : null;

    const handoff = previous?.dataManagerHandoff;

    if (
      !handoff ||
      handoff.newAssignmentVersion !==
        assignmentVersion(record) ||
      previous.addressRevision !==
        (record.revision ?? 0) ||
      String(previous.reviewerId) !==
        String(req.user._id)
    ) {
      return res.json({
        success: true,
        context: null,
      });
    }

    const stillAssigned = await addresses().findOne(
      {
        ...filter,

        ...revisionFilter(record),

        "reviewAssignment.assignedAt":
          record.reviewAssignment.assignedAt,

        "encryptedPayload.iv":
          record.encryptedPayload.iv,
      },

      { projection: { _id: 1 } }
    );

    if (!stillAssigned) {
      return conflict(res);
    }

    await audit(
      req,
      "REVIEWER_HANDOFF_CONTEXT_ACCESS",
      "success",
      id
    );

    return res.json({
      success: true,

      context: {
        note: handoff.note,

        handedOffAt: handoff.handedOffAt,

        assignedAt: assignmentVersion(record),
      },
    });
  }
);

export default router;
