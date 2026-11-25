import { env } from "../config/env.js";
import { getMainDB } from "../config/database.js";

import { recordAudit } from "./audit.service.js";

import {
  encryptData,
  decryptData,
  addressAAD,
} from "../utils/encryption.js";

const MAX_LOCALITIES = 1000;

// =====================================
// ERROR HELPER
// =====================================

function serviceError(status, code, message) {
  const error = new Error(message);

  error.status = status;
  error.code = code;

  return error;
}

// =====================================
// APPROVED LOCALITY SNAPSHOT
// =====================================

function localitySnapshot(record) {
  const locality = record.locality ?? record;

  if (
    typeof record.id !== "string" ||
    typeof locality.nameEn !== "string" ||
    typeof locality.nameBn !== "string"
  ) {
    throw serviceError(
      503,
      "LOCALITY_DATA_INVALID",
      "Approved locality data is unavailable."
    );
  }

  return {
    localityId: record.id,

    locality: {
      nameEn: locality.nameEn,
      nameBn: locality.nameBn,

      areaEn: locality.areaEn ?? "",
      areaBn: locality.areaBn ?? "",

      districtEn: locality.districtEn ?? "",
      districtBn: locality.districtBn ?? "",

      divisionEn: locality.divisionEn ?? "",
      divisionBn: locality.divisionBn ?? "",
    },
  };
}

// =====================================
// GET APPROVED LOCALITIES
// =====================================

export async function getApprovedReviewLocalities() {
  const records = await getMainDB()
    .collection("localities")
    .find({ approved: true })
    .sort({ id: 1 })
    .limit(MAX_LOCALITIES + 1)
    .toArray();

  if (records.length > MAX_LOCALITIES) {
    throw serviceError(
      503,
      "LOCALITY_LIMIT_EXCEEDED",
      "The locality dataset requires pagination."
    );
  }

  return records.map(localitySnapshot);
}

// =====================================
// SUBMIT REVIEW DECISION
// =====================================

export async function submitReviewDecision({
  req,
  addressId,
  reviewerId,
  input,
}) {
  const db = getMainDB();

  const collection =
    db.collection("address_requests");

  const action =
    input.decision === "resolved"
      ? "REVIEW_RESOLVE"
      : "REVIEW_ESCALATE";

  const record = await collection.findOne({
    _id: addressId,

    decision: "review_requested",

    "reviewAssignment.reviewerId":
      reviewerId,
  });

  if (!record) {
    await recordAudit({
      req,
      userId: reviewerId,
      targetId: addressId,
      action,
      result: "denied",
    });

    throw serviceError(
      404,
      "REVIEW_NOT_FOUND",
      "Assigned review request was not found."
    );
  }

  if (
    record.reviewAssignment.status !== "pending"
  ) {
    throw serviceError(
      409,
      "REVIEW_ALREADY_DECIDED",
      "This review has already been processed."
    );
  }

  const currentRevision =
    record.revision ?? 0;

  if (input.revision !== currentRevision) {
    throw serviceError(
      409,
      "REVISION_CONFLICT",
      "The address has changed. Refresh the review."
    );
  }

  // =====================================
  // ASSIGNMENT VERSION PROTECTION
  // =====================================

  const assignmentVersion =
    new Date(
      record.reviewAssignment.assignedAt
    ).toISOString();

  const submittedAssignment =
    req.get("X-Review-Assignment");

  const hasPreviousReviews =
    Array.isArray(record.reviewHistory) &&
    record.reviewHistory.length > 0;

  // First-cycle compatibility.
  // Subsequent assignments require the
  // current assignment timestamp.

  if (
    (hasPreviousReviews ||
      submittedAssignment !== undefined) &&
    submittedAssignment !== assignmentVersion
  ) {
    throw serviceError(
      409,
      "REVIEW_DECISION_CONFLICT",
      "The review assignment has changed. Reopen the assigned request."
    );
  }

  // =====================================
  // VALIDATE APPROVED LOCALITY
  // =====================================

  let recommendedLocality = null;

  if (input.decision === "resolved") {
    const locality = await db
      .collection("localities")
      .findOne({
        id: input.localityId,
        approved: true,
      });

    if (!locality) {
      throw serviceError(
        400,
        "INVALID_REVIEW_LOCALITY",
        "Select an approved locality."
      );
    }

    recommendedLocality =
      localitySnapshot(locality);
  }

  // =====================================
  // DECRYPT ORIGINAL PAYLOAD
  // =====================================

  const aad = addressAAD(
    record._id,
    record.ownerId
  );

  const decrypted = decryptData(
    record.encryptedPayload,

    env.ADDRESS_ENCRYPTION_KEY,

    aad
  );

  const now = new Date();

  const reviewOutcome = {
    decision: input.decision,

    recommendation: recommendedLocality,

    note: input.note,

    reviewerId: reviewerId.toString(),

    addressRevision: currentRevision,

    assignmentVersion,

    decidedAt: now.toISOString(),
  };

  const encryptedPayload = encryptData(
    {
      ...decrypted,
      reviewOutcome,
    },

    env.ADDRESS_ENCRYPTION_KEY,

    aad
  );

  await recordAudit({
    req,
    userId: reviewerId,
    targetId: addressId,
    action,
    result: "started",
  });

  // =====================================
  // ATOMIC REVIEW UPDATE
  // =====================================

  const updated = await collection.updateOne(
    {
      _id: addressId,

      ownerId: record.ownerId,

      decision: "review_requested",

      revision:
        record.revision === undefined
          ? { $exists: false }
          : record.revision,

      "reviewAssignment.reviewerId":
        reviewerId,

      "reviewAssignment.status":
        "pending",

      "reviewAssignment.assignedAt":
        record.reviewAssignment.assignedAt,

      "encryptedPayload.iv":
        record.encryptedPayload.iv,
    },

    {
      $set: {
        encryptedPayload,

        "reviewAssignment.status":
          input.decision,

        "reviewAssignment.decidedAt":
          now,

        updatedAt: now,
      },
    }
  );

  if (updated.modifiedCount !== 1) {
    await recordAudit({
      req,
      userId: reviewerId,
      targetId: addressId,
      action,
      result: "conflict",
    });

    throw serviceError(
      409,
      "REVIEW_DECISION_CONFLICT",
      "Another operation changed this review."
    );
  }

  await recordAudit({
    req,
    userId: reviewerId,
    targetId: addressId,
    action,
    result: "success",
  });

  return {
    success: true,

    jobId: addressId.toString(),

    reviewStatus: input.decision,

    revision: currentRevision,

    decidedAt: now,

    message:
      input.decision === "resolved"
        ? "Reviewer recommendation recorded."
        : "Request marked for escalation.",
  };
}