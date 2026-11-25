import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getMainDB } from "../config/database.js";
import { recordAudit } from "./audit.service.js";

const emailSchema = z.string()
  .trim()
  .toLowerCase()
  .email();

const idSchema = z.string()
  .regex(/^[a-f0-9]{24}$/i);

// =====================================
// OPERATOR ERROR HELPER
// =====================================

function operatorError(code, message) {
  const error = new Error(message);

  error.code = code;

  return error;
}

// =====================================
// LOCAL OPERATOR AUDIT
// =====================================

function auditOperator(action, result, targetId) {
  return recordAudit({
    req: {
      requestId: randomUUID(),
    },

    userId: null,

    action,

    result,

    targetId,
  });
}

// =====================================
// REVIEW QUEUE INDEX
// =====================================

export async function initializeReviewerIndexes() {
  await getMainDB()
    .collection("address_requests")
    .createIndex(
      {
        "reviewAssignment.reviewerId": 1,
        "reviewAssignment.status": 1,
        _id: -1,
      },
      {
        name: "reviewer_assigned_queue",

        partialFilterExpression: {
          "reviewAssignment.reviewerId": {
            $exists: true,
          },
        },
      }
    );

  console.log(
    "[DATABASE] Reviewer queue index initialized"
  );
}

// =====================================
// PROVISION REVIEWER ACCOUNT
// =====================================

export async function provisionReviewer(email) {
  const parsed = emailSchema.safeParse(email);

  if (!parsed.success) {
    throw operatorError(
      "INVALID_EMAIL",
      "Enter a valid account email."
    );
  }

  const db = getMainDB();

  const users = db.collection("users");

  const sessions = db.collection("sessions");

  const user = await users.findOne({
    email: parsed.data,
    role: "merchant",
    status: "active",
  });

  if (!user) {
    throw operatorError(
      "ACCOUNT_NOT_ELIGIBLE",
      "A new active merchant account is required."
    );
  }

  // Never convert an existing merchant
  // account that owns address records.

  const existingAddress = await db
    .collection("address_requests")
    .findOne(
      {
        ownerId: user._id,
      },
      {
        projection: {
          _id: 1,
        },
      }
    );

  if (existingAddress) {
    await auditOperator(
      "REVIEWER_PROVISION",
      "denied",
      user._id
    );

    throw operatorError(
      "ACCOUNT_HAS_ADDRESSES",
      "Use a dedicated account with no address records."
    );
  }

  await auditOperator(
    "REVIEWER_PROVISION",
    "started",
    user._id
  );

  // Revoke previous sessions before
  // changing the account role.

  await sessions.deleteMany({
    userId: user._id,
  });

  const updated = await users.updateOne(
    {
      _id: user._id,
      role: "merchant",
      status: "active",
    },
    {
      $set: {
        role: "reviewer",
        updatedAt: new Date(),
      },
    }
  );

  if (updated.modifiedCount !== 1) {
    await auditOperator(
      "REVIEWER_PROVISION",
      "conflict",
      user._id
    );

    throw operatorError(
      "PROVISION_CONFLICT",
      "The account changed during provisioning."
    );
  }

  // Revoke any remaining sessions.

  await sessions.deleteMany({
    userId: user._id,
  });

  await auditOperator(
    "REVIEWER_PROVISION",
    "success",
    user._id
  );

  return {
    success: true,
    userId: user._id.toString(),
    role: "reviewer",
    message: "Reviewer account provisioned.",
  };
}

// =====================================
// ASSIGN MANUAL REVIEW
// =====================================

export async function assignReview(
  jobId,
  reviewerEmail
) {
  const parsedId = idSchema.safeParse(jobId);

  const parsedEmail =
    emailSchema.safeParse(reviewerEmail);

  if (
    !parsedId.success ||
    !parsedEmail.success
  ) {
    throw operatorError(
      "INVALID_ASSIGNMENT",
      "Provide a valid job ID and reviewer email."
    );
  }

  const db = getMainDB();

  const addressId =
    new ObjectId(parsedId.data);

  const reviewer = await db
    .collection("users")
    .findOne(
      {
        email: parsedEmail.data,
        role: "reviewer",
        status: "active",
      },
      {
        projection: {
          _id: 1,
        },
      }
    );

  if (!reviewer) {
    await auditOperator(
      "REVIEW_ASSIGN",
      "denied",
      addressId
    );

    throw operatorError(
      "REVIEWER_NOT_AVAILABLE",
      "An active reviewer account is required."
    );
  }

  const now = new Date();

  await auditOperator(
    "REVIEW_ASSIGN",
    "started",
    addressId
  );

  // Atomic assignment prevents duplicate
  // assignment by concurrent operators.

  const assigned = await db
    .collection("address_requests")
    .findOneAndUpdate(
      {
        _id: addressId,
        decision: "review_requested",
        reviewAssignment: {
          $exists: false,
        },
      },
      {
        $set: {
          reviewAssignment: {
            reviewerId: reviewer._id,
            status: "pending",
            assignedAt: now,
          },

          updatedAt: now,
        },
      },
      {
        returnDocument: "after",

        projection: {
          _id: 1,
          reviewAssignment: 1,
        },
      }
    );

  if (!assigned) {
    await auditOperator(
      "REVIEW_ASSIGN",
      "conflict",
      addressId
    );

    throw operatorError(
      "REVIEW_NOT_ASSIGNABLE",
      "The request is missing, already assigned, or not awaiting manual review."
    );
  }

  await auditOperator(
    "REVIEW_ASSIGN",
    "success",
    addressId
  );

  return {
    success: true,

    jobId:
      assigned._id.toString(),

    reviewerId:
      reviewer._id.toString(),

    reviewStatus: "pending",

    assignedAt: now,

    message:
      "Manual review assigned successfully.",
  };
}