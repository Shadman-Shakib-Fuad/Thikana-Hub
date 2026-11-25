import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getMainDB } from "../config/database.js";
import { recordAudit } from "./audit.service.js";

// =====================================
// EMAIL VALIDATION
// =====================================

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

// =====================================
// SERVICE ERROR CLASS
// =====================================

export class DataManagerAdminError extends Error {
  constructor(code, message) {
    super(message);

    this.name = "DataManagerAdminError";
    this.code = code;
  }
}

// =====================================
// DATA MANAGER PROVISIONING
// =====================================

export async function provisionDataManager(rawEmail) {
  if (process.env.NODE_ENV !== "development") {
    throw new DataManagerAdminError(
      "DEVELOPMENT_ONLY",
      "Local provisioning is restricted to development."
    );
  }

  const parsed = emailSchema.safeParse(rawEmail);

  if (!parsed.success) {
    throw new DataManagerAdminError(
      "INVALID_EMAIL",
      "A valid account email is required."
    );
  }

  const db = getMainDB();

  const users = db.collection("users");
  const sessions = db.collection("sessions");
  const addresses = db.collection("address_requests");

  const req = {
    requestId: randomUUID(),
  };

  let targetId = null;

  async function audit(result) {
    await recordAudit({
      req,
      userId: null,
      action: "DATA_MANAGER_PROVISION",
      result,
      targetId,
    });
  }

  try {
    // Find eligible merchant account.

    const account = await users.findOne(
      { email: parsed.data },
      {
        projection: {
          _id: 1,
          role: 1,
          status: 1,
        },
      }
    );

    if (account) {
      targetId = String(account._id);
    }

    if (
      !account ||
      account.role !== "merchant" ||
      account.status !== "active"
    ) {
      throw new DataManagerAdminError(
        "ACCOUNT_NOT_ELIGIBLE",
        "An active merchant account is required."
      );
    }

    // Protect existing merchant data.

    const ownedAddress = await addresses.findOne(
      { ownerId: account._id },
      { projection: { _id: 1 } }
    );

    if (ownedAddress) {
      throw new DataManagerAdminError(
        "ACCOUNT_HAS_ADDRESSES",
        "Use a dedicated account without existing addresses."
      );
    }

    await audit("started");

    // Revoke existing sessions.

    await sessions.deleteMany({
      userId: account._id,
    });

    // Recheck existing address records.

    const existingAddress = await addresses.findOne(
      { ownerId: account._id },
      { projection: { _id: 1 } }
    );

    if (existingAddress) {
      throw new DataManagerAdminError(
        "ACCOUNT_HAS_ADDRESSES",
        "This account owns existing address records."
      );
    }

    // Atomic role transition.

    const updated = await users.updateOne(
      {
        _id: account._id,
        role: "merchant",
        status: "active",
      },
      {
        $set: {
          role: "data_manager",
          updatedAt: new Date(),
        },
      }
    );

    if (updated.modifiedCount !== 1) {
      throw new DataManagerAdminError(
        "ROLE_CHANGE_CONFLICT",
        "The account changed during provisioning."
      );
    }

    // Revoke remaining sessions.

    await sessions.deleteMany({
      userId: account._id,
    });

    await audit("success");

    return {
      success: true,
      userId: String(account._id),
      role: "data_manager",
      message: "Data Manager account provisioned successfully.",
    };

  } catch (error) {
    await audit("failure");
    throw error;
  }
}