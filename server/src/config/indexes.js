import { isDeepStrictEqual } from "node:util";
import { getMainDB, getAuditDB } from "./database.js";

// Index names are administrative labels, but keys and options matter.
// Never drop/rebuild a conflicting index automatically.
function sameDefinition(index, keys, options) {
  return isDeepStrictEqual(Object.entries(index.key ?? {}), Object.entries(keys)) &&
    Boolean(index.unique) === Boolean(options.unique) &&
    Boolean(index.sparse) === Boolean(options.sparse) &&
    index.hidden !== true &&
    index.expireAfterSeconds === options.expireAfterSeconds &&
    isDeepStrictEqual(index.partialFilterExpression, options.partialFilterExpression) &&
    (!index.collation || index.collation.locale === "simple") &&
    !index.prepareUnique;
}

async function ensureIndex(db, collectionName, keys, options) {
  const collection = db.collection(collectionName);
  const label = `${collectionName}/${options.name}`;
  try {
    await collection.createIndex(keys, options);
    console.log(`[INDEX OK] ${label}`);
    return;
  } catch (error) {
    console.error(`[INDEX CONFLICT/ERROR] ${label} code=${error.code ?? "unknown"}`);
    if (error.code !== 85 && error.code !== 86) throw error;

    // Only reuse an equivalent existing index; ask MongoDB to verify
    // the requested options again using the existing name.
    const indexes = await collection.listIndexes().toArray();
    const equivalent = indexes.find(index =>
      index.name !== options.name && sameDefinition(index, keys, options)
    );
    if (!equivalent) {
      console.error(`[INDEX REVIEW REQUIRED] ${label}; no equivalent index found.`);
      console.error(JSON.stringify(indexes.map(index => ({
        name: index.name,
        key: index.key,
        unique: Boolean(index.unique),
        sparse: Boolean(index.sparse),
        hidden: Boolean(index.hidden),
        expireAfterSeconds: index.expireAfterSeconds,
        partialFilterExpression: index.partialFilterExpression,
        collationLocale: index.collation?.locale,
      }))));
      throw error;
    }
    await collection.createIndex(keys, { ...options, name: equivalent.name });
    console.log(`[INDEX REUSED] ${label} -> ${equivalent.name}`);
  }
}

export async function initializeIndexes() {
  const mainDB = getMainDB();
  const auditDB = getAuditDB();
  // Preserve all Phase 10 indexes, including unique email and session TTL.
  // Sequential initialization makes startup failures attributable to one index.
  const definitions = [
    [mainDB, "users", { email: 1 }, { unique: true, name: "unique_user_email" }],
    [mainDB, "sessions", { expiresAt: 1 }, { expireAfterSeconds: 0, name: "session_expiry" }],
    [mainDB, "sessions", { userId: 1 }, { name: "session_user" }],
    [mainDB, "address_requests", { ownerId: 1, saved: 1, _id: -1 }, { name: "address_saved_pagination" }],
    [mainDB, "address_requests", { ownerId: 1, _id: -1 }, { name: "address_owner_pagination" }],
    [mainDB, "address_requests", { ownerId: 1, createdAt: -1 }, { name: "address_owner_history" }],
    [mainDB, "address_requests", { status: 1, createdAt: -1 }, { name: "address_status" }],
    [auditDB, "audit_events", { createdAt: -1 }, { name: "audit_created_at" }],
    [auditDB, "audit_events", { userId: 1, createdAt: -1 }, { name: "audit_user_activity" }],
    [mainDB, "users", { role: 1, status: 1, _id: -1 }, { name: "user_role_status_page" }],
    [mainDB, "address_requests", { decision: 1, "reviewAssignment.status": 1, _id: -1 }, { name: "review_queue_status_page" }],
    [auditDB, "audit_events", { action: 1, result: 1, _id: -1 }, { name: "audit_action_result_page" }],
  ];
  for (const [db, name, keys, options] of definitions) {
    await ensureIndex(db, name, keys, options);
  }
  console.log("[DATABASE] Authentication indexes initialized");
  console.log("[DATABASE] Address indexes initialized");
  console.log("[DATABASE] Phase 11 performance indexes verified");
}
