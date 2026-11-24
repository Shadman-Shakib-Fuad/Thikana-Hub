import { getAuditDB } from "../config/database.js";

export async function recordAudit({
  req,
  userId = null,
  action,
  result,
  targetId = null,
}) {
  const event = {
    userId,

    action,

    result,

    targetId,

    requestId: req.requestId,

    createdAt: new Date(),
  };

  await getAuditDB()
    .collection("audit_events")
    .insertOne(event);
}