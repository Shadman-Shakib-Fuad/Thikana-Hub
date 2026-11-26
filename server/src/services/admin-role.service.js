import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { getMainDB } from "../config/database.js";
import { recordAudit } from "./audit.service.js";

const TX_OPTIONS = {
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority" },
  readPreference: "primary",
  maxCommitTimeMS: 10000,
};

export class RoleAssignmentError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "RoleAssignmentError";
    this.status = status;
    this.code = code;
  }
}

// Address creation and role changes both write the same user document.
// MongoDB therefore serializes conflicting writes or retries the transaction.
export async function insertMerchantAddress(user, document) {
  const db = getMainDB();
  const session = db.client.startSession();
  try {
    return await session.withTransaction(async () => {
      const fence = await db.collection("users").updateOne({
        _id: user._id,
        status: "active",
        role: "merchant",
        securityVersion: user.securityVersion ?? null,
      }, {
        $set: { addressWriteFence: randomUUID() },
      }, { session });
      if (fence.matchedCount !== 1) return false;
      await db.collection("address_requests").insertOne(document, { session });
      return true;
    }, TX_OPTIONS);
  } finally {
    await session.endSession();
  }
}

export async function assignAdminRole(req, userId, role) {
  if (!["reviewer", "data_manager"].includes(role)) {
    throw new RoleAssignmentError(400, "INVALID_ROLE_ASSIGNMENT", "Invalid target role.");
  }
  const targetId = new ObjectId(userId);
  const actorId = req.user._id;
  const action = role === "reviewer"
    ? "ADMIN_ROLE_ASSIGN_REVIEWER"
    : "ADMIN_ROLE_ASSIGN_DATA_MANAGER";
  const audit = result => recordAudit({ req, userId: actorId, action, result, targetId });
  const db = getMainDB();
  const session = db.client.startSession();
  const securityVersion = randomUUID();
  const changedAt = new Date();
  let outcome;
  try {
    // Fail closed if the initial administrative audit cannot be recorded.
    await audit("started");
    outcome = await session.withTransaction(async () => {
      if (String(actorId) === String(targetId)) {
        throw new RoleAssignmentError(403, "SELF_ROLE_CHANGE_FORBIDDEN", "You cannot change your own role.");
      }
      const users = db.collection("users");
      const actor = await users.findOne({
        _id: actorId, role: "admin", status: "active",
        securityVersion: req.user.securityVersion ?? null,
      }, { session, projection: { _id: 1 } });
      if (!actor) throw new RoleAssignmentError(403, "ADMIN_ACCOUNT_CHANGED", "Administrator access is no longer available.");

      const target = await users.findOne({ _id: targetId }, {
        session, projection: { _id: 1, role: 1, status: 1, securityVersion: 1 },
      });
      if (!target) throw new RoleAssignmentError(404, "USER_NOT_FOUND", "The requested user was not found.");
      if (target.role !== "merchant" || target.status !== "active") {
        throw new RoleAssignmentError(409, "ACCOUNT_NOT_ELIGIBLE", "An active Merchant account is required.");
      }
      // Write the account before checking ownership. A concurrent address
      // insertion must acquire the same account write fence.
      const changed = await users.updateOne({
        _id: targetId, role: "merchant", status: "active",
        securityVersion: target.securityVersion ?? null,
      }, { $set: { role, securityVersion, updatedAt: changedAt } }, { session });
      if (changed.modifiedCount !== 1) {
        throw new RoleAssignmentError(409, "ROLE_CHANGE_CONFLICT", "The account changed. Refresh the user details.");
      }
      const owned = await db.collection("address_requests").findOne({ ownerId: targetId }, {
        session, projection: { _id: 1 },
      });
      if (owned) throw new RoleAssignmentError(409, "ACCOUNT_HAS_ADDRESS_RECORDS", "Use a dedicated account without existing addresses.");
      const revoked = await db.collection("sessions").deleteMany({ userId: targetId }, { session });
      return { userId: String(targetId), previousRole: "merchant", role, revokedSessions: revoked.deletedCount, updatedAt: changedAt.toISOString() };
    }, TX_OPTIONS);
  } catch (error) {
    // An uncertain commit must not be described as a confirmed rollback.
    try { await audit(error instanceof RoleAssignmentError ? "denied" : "unconfirmed"); }
    catch { console.error("[ADMIN_ROLE_AUDIT_UNAVAILABLE]", req.requestId); }
    throw error;
  } finally {
    await session.endSession();
  }
  // Separate database/client: final audit is not part of the main transaction.
  let auditRecorded = true;
  try { await audit("success"); }
  catch {
    auditRecorded = false;
    console.error("[ADMIN_ROLE_COMMITTED_AUDIT_UNAVAILABLE]", req.requestId);
  }
  return { ...outcome, auditRecorded, message: auditRecorded
    ? "Role assigned successfully. The user must sign in again."
    : "Role assigned. Final audit confirmation unavailable; contact the system operator." };
}
