import { provisionDedicatedAccount } from "./operator-provision.service.js";
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
  if (!parsed.success) throw operatorError("INVALID_EMAIL", "Enter a valid account email.");
  return provisionDedicatedAccount(parsed.data,"reviewer","REVIEWER_PROVISION");
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

  // Match the Admin API's account write fence: assignment and account
  // suspension must serialize on the same reviewer document.
  const session = db.client.startSession();
  let assigned;
  try {
    assigned = await session.withTransaction(async () => {
      const fence = await db.collection("users").updateOne(
        { _id: reviewer._id, role: "reviewer", status: "active" },
        { $set: { reviewerWriteFence: randomUUID() } },
        { session }
      );
      if (!fence.matchedCount) {
        throw operatorError("REVIEWER_NOT_AVAILABLE", "An active reviewer account is required.");
      }
      const record = await db.collection("address_requests").findOneAndUpdate(
        { _id: addressId, decision: "review_requested", reviewAssignment: { $exists: false } },
        { $set: { reviewAssignment: { reviewerId: reviewer._id, status: "pending", assignedAt: now }, updatedAt: now } },
        { session, returnDocument: "after", projection: { _id: 1, reviewAssignment: 1 } }
      );
      if (!record) throw operatorError("REVIEW_NOT_ASSIGNABLE", "The request is missing, already assigned, or not awaiting manual review.");
      return record;
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary", maxCommitTimeMS: 10000 });
  } catch (error) {
    try { await auditOperator("REVIEW_ASSIGN", "conflict", addressId); }
    catch { console.error("[REVIEW_ASSIGN_AUDIT_UNAVAILABLE]"); }
    throw error;
  } finally {
    await session.endSession();
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