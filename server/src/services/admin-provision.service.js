import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getMainDB } from "../config/database.js";
import { recordAudit } from "./audit.service.js";

export async function provisionAdmin(rawEmail) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "Admin provisioning is restricted to development."
    );
  }

  const email = z.string()
    .trim()
    .toLowerCase()
    .email()
    .max(254)
    .parse(rawEmail);

  const db = getMainDB();

  const users = db.collection("users");
  const sessions = db.collection("sessions");
  const addresses = db.collection("address_requests");

  const user = await users.findOne({
    email,
    role: "merchant",
    status: "active",
  });

  if (!user) {
    throw new Error(
      "An active dedicated merchant account is required."
    );
  }

  const req = {
    requestId: randomUUID(),
  };

  async function audit(result) {
    await recordAudit({
      req,
      userId: null,
      action: "ADMIN_PROVISION",
      targetId: String(user._id),
      result,
    });
  }

  await audit("started");

  if (await addresses.findOne({
    ownerId: user._id,
  })) {
    await audit("denied");

    throw new Error(
      "An account with existing addresses cannot become an administrator."
    );
  }

  await sessions.deleteMany({
    userId: user._id,
  });

  if (await addresses.findOne({
    ownerId: user._id,
  })) {
    await audit("denied");

    throw new Error(
      "Address ownership conflict detected."
    );
  }

  const result = await users.updateOne(
    {
      _id: user._id,
      role: "merchant",
      status: "active",
    },

    {
      $set: {
        role: "admin",
        updatedAt: new Date(),
      },
    }
  );

  if (result.modifiedCount !== 1) {
    await audit("conflict");

    throw new Error(
      "Account provisioning conflict."
    );
  }

  await sessions.deleteMany({
    userId: user._id,
  });

  await audit("success");

  return {
    success: true,
    userId: String(user._id),
    role: "admin",
    message: "Admin account provisioned successfully.",
  };
}
