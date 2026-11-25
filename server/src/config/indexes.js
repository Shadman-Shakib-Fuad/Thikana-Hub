import {
  getMainDB,
  getAuditDB,
} from "./database.js";

export async function initializeIndexes() {
  const mainDB = getMainDB();
  const auditDB = getAuditDB();

  await Promise.all([
    mainDB.collection("address_requests").createIndex(
      { ownerId: 1, saved: 1, _id: -1 },
      {
        name: "address_saved_pagination",
      }
    ),
    mainDB.collection("address_requests").createIndex(
      { ownerId: 1, _id: -1 },
      {
        name: "address_owner_pagination",
      }
    ),
    mainDB.collection("users").createIndex(
      { email: 1 },
      {
        unique: true,
        name: "unique_user_email",
      }
    ),

    mainDB.collection("sessions").createIndex(
      { expiresAt: 1 },
      {
        expireAfterSeconds: 0,
        name: "session_expiry",
      }
    ),

    mainDB.collection("sessions").createIndex(
      { userId: 1 },
      {
        name: "session_user",
      }
    ),

    mainDB.collection("address_requests").createIndex(
      { ownerId: 1, createdAt: -1 },
      {
        name: "address_owner_history",
      }
    ),

    mainDB.collection("address_requests").createIndex(
      { status: 1, createdAt: -1 },
      {
        name: "address_status",
      }
    ),

    auditDB.collection("audit_events").createIndex(
      { createdAt: -1 },
      {
        name: "audit_created_at",
      }
    ),

    auditDB.collection("audit_events").createIndex(
      { userId: 1, createdAt: -1 },
      {
        name: "audit_user_activity",
      }
    ),
  ]);

  console.log(
    "[DATABASE] Authentication indexes initialized"
  );

  console.log(
    "[DATABASE] Address indexes initialized"
  );
}