import { Router } from "express";
import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { isTrustedOrigin } from "../utils/mobile-auth.js";
import { getMainDB, getAuditDB } from "../config/database.js";
import { adminAccess, rejectUnexpectedQuery } from "../middleware/admin.middleware.js";
import { recordAudit } from "../services/audit.service.js";

const router = Router();
const BASE = "/p14/admin";
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const paging = { limit: z.string().regex(/^(?:[1-9]|[1-4][0-9]|50)$/).optional(), cursor: id.optional() };
const pageSchema = z.object(paging).strict();
const queueSchema = z.object({ ...paging, jobId: id.optional(), status: z.enum(["unassigned", "pending", "escalated", "resolved"]).optional() }).strict();
const auditSchema = z.object({ ...paging, action: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/).optional(), result: z.string().regex(/^[a-z_]{1,30}$/).optional(), actorId: id.optional() }).strict();
const localitySchema = z.object({ ...paging, q: z.string().trim().max(80).optional() }).strict();
const assignmentSchema = z.object({ reviewerId: id, revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
const statusSchema = z.object({ status: z.enum(["active", "suspended"]), expectedStatus: z.enum(["active", "suspended"]) }).strict();
const emptySchema = z.object({}).strict();
const TX = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary", maxCommitTimeMS: 10000 };
const unassigned = { decision: "review_requested", reviewAssignment: { $exists: false } };
const activeReview = { decision: "review_requested" };
const iso = value => value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
const oid = value => new ObjectId(value);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
class AdminError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const fail = (status, code, message) => { throw new AdminError(status, code, message); };
function parse(schema, value) { const result = schema.safeParse(value); if (!result.success) fail(400, "INVALID_INPUT", "Invalid management request."); return result.data; }
function trusted(req, res, next) { if (!isTrustedOrigin(req, env.CLIENT_URL, env.MOBILE_AUTH_ENABLED)) return res.status(403).json({success:false,code:"UNTRUSTED_ORIGIN",message:"Request origin is not allowed."}); next(); }
function handler(fn) { return async (req, res) => { try { return res.json({ success: true, ...await fn(req) }); } catch (error) { if (error instanceof AdminError) return res.status(error.status).json({ success:false, code:error.code, message:error.message }); console.error("[ADMIN_MANAGEMENT_ERROR]", req.requestId, error.name, error.code ?? ""); return res.status(503).json({ success:false, code:"ADMIN_MANAGEMENT_UNAVAILABLE",message:"Operation could not be confirmed. Refresh before retrying." }); } }; }
async function paged(collection, filter, query, projection, map) {
  const limit = Number(query.limit ?? 20);
  if (query.cursor) filter._id = { $lt: oid(query.cursor) };
  const rows = await collection.find(filter, { projection, maxTimeMS: 10000 }).sort({_id:-1}).limit(limit+1).toArray();
  const page = rows.slice(0,limit), hasMore = rows.length > limit;
  return { items: page.map(map), pagination: { limit, hasMore, nextCursor: hasMore ? String(page.at(-1)._id) : null } };
}
async function audit(req, action, result, targetId = null) { await recordAudit({ req, userId:req.user._id, action, result, targetId }); }
async function mutate(req, action, targetId, fn) {
  const db = getMainDB();
  await audit(req, action, "started", targetId);
  const session = db.client.startSession();
  let result;
  try {
    result = await session.withTransaction(async () => {
      const actor = await db.collection("users").findOne({ _id:req.user._id,role:"admin",status:"active",securityVersion:req.user.securityVersion ?? null }, {session,projection:{_id:1}});
      if (!actor) fail(403,"ADMIN_ACCOUNT_CHANGED","Administrator account changed.");
      return fn(db,session);
    },TX);
  } catch (error) {
    try { await audit(req,action,error instanceof AdminError ? "denied" : "unconfirmed",targetId); } catch { console.error("[ADMIN_AUDIT_UNAVAILABLE]",req.requestId); }
    throw error;
  } finally { await session.endSession(); }
  let auditRecorded = true;
  try { await audit(req,action,"success",targetId); } catch { auditRecorded=false; console.error("[ADMIN_COMMITTED_AUDIT_UNAVAILABLE]",req.requestId); }
  return {...result,auditRecorded};
}
router.get(`${BASE}/review-queue`, ...adminAccess, handler(async req => {
  const q = parse(queueSchema,req.query);
  const status = q.status ?? "unassigned";
  const filter = status === "unassigned" ? {...unassigned} : {...activeReview,"reviewAssignment.status":status};
  if (q.jobId && q.cursor) fail(400,"INVALID_QUERY","Use request ID or cursor, not both.");
  if (q.jobId) filter._id = oid(q.jobId);
  return paged(getMainDB().collection("address_requests"),filter,q,{_id:1,revision:1,status:1,createdAt:1,updatedAt:1,"reviewAssignment.status":1,"reviewAssignment.reviewerId":1,"reviewAssignment.assignedAt":1},r=>({jobId:String(r._id),revision:r.revision??0,addressStatus:r.status,reviewStatus:r.reviewAssignment?.status??"unassigned",reviewerId:r.reviewAssignment?.reviewerId?String(r.reviewAssignment.reviewerId):null,assignedAt:iso(r.reviewAssignment?.assignedAt),createdAt:iso(r.createdAt)}));
}));
router.get(`${BASE}/reviewers`, ...adminAccess, handler(async req => {
  const q = parse(pageSchema,req.query), db=getMainDB();
  const result=await paged(db.collection("users"),{role:"reviewer",status:"active"},q,{_id:1,name:1,email:1},r=>({userId:String(r._id),name:r.name,email:r.email,pending:0,escalated:0,awaitingConfirmation:0}));
  const rows=await db.collection("address_requests").aggregate([
    {$match:{...activeReview,"reviewAssignment.reviewerId":{$in:result.items.map(r=>oid(r.userId))}}},
    {$group:{_id:{reviewer:"$reviewAssignment.reviewerId",status:"$reviewAssignment.status"},total:{$sum:1}}}
  ],{maxTimeMS:10000}).toArray();
  for(const row of rows){const item=result.items.find(r=>r.userId===String(row._id.reviewer));const key={pending:"pending",escalated:"escalated",resolved:"awaitingConfirmation"}[row._id.status];if(item&&key)item[key]=row.total;}
  return result;
}));
router.post(`${BASE}/review-queue/:jobId/assign`, ...adminAccess, trusted, rejectUnexpectedQuery, handler(async req => {
  const jobId=oid(parse(id,req.params.jobId)), body=parse(assignmentSchema,req.body), reviewerId=oid(body.reviewerId);
  return mutate(req,"ADMIN_REVIEW_ASSIGN",jobId,async(db,session)=>{
    // Assignment and suspension both write the reviewer account, so a suspended reviewer cannot win a concurrent assignment.
    const fence=await db.collection("users").updateOne({_id:reviewerId,role:"reviewer",status:"active"},{$set:{reviewerWriteFence:randomUUID()}},{session});
    if(!fence.matchedCount)fail(409,"REVIEWER_NOT_AVAILABLE","Select an active reviewer.");
    const record=await db.collection("address_requests").findOne({_id:jobId},{session,projection:{_id:1,revision:1,decision:1,reviewAssignment:1}});
    if(!record)fail(404,"REVIEW_NOT_FOUND","Request was not found.");
    if(record.decision!=="review_requested"||record.reviewAssignment!==undefined||(record.revision??0)!==body.revision)fail(409,"REVIEW_NOT_ASSIGNABLE","Request changed or is already assigned.");
    const assignedAt=new Date();
    const changed=await db.collection("address_requests").updateOne({_id:jobId,...unassigned,...(record.revision===undefined?{revision:{$exists:false}}:{revision:body.revision})},{$set:{reviewAssignment:{reviewerId,status:"pending",assignedAt},updatedAt:assignedAt}},{session});
    if(changed.modifiedCount!==1)fail(409,"REVIEW_NOT_ASSIGNABLE","Request changed. Refresh the queue.");
    return {jobId:String(jobId),reviewerId:String(reviewerId),reviewStatus:"pending",assignedAt:assignedAt.toISOString()};
  });
}));
async function accountSecurity(req, body, operation) {
  const targetId=oid(parse(id,req.params.userId));
  if(String(targetId)===String(req.user._id))fail(403,"SELF_ACCOUNT_CHANGE_FORBIDDEN","You cannot modify your own account.");
  const action=operation==="revoke"?"ADMIN_SESSION_REVOKE":body.status==="suspended"?"ADMIN_ACCOUNT_SUSPEND":"ADMIN_ACCOUNT_REACTIVATE";
  return mutate(req,action,targetId,async(db,session)=>{
    const users=db.collection("users");
    const target=await users.findOne({_id:targetId},{session,projection:{_id:1,role:1,status:1,securityVersion:1}});
    if(!target)fail(404,"USER_NOT_FOUND","User not found.");
    if(!["merchant","reviewer","data_manager"].includes(target.role))fail(403,"PROTECTED_ACCOUNT","Administrator accounts cannot be changed through this API.");
    if(!["active","suspended"].includes(target.status))fail(409,"ACCOUNT_NOT_ELIGIBLE","Unsupported account status.");
    if(operation!=="revoke"&&(target.status!==body.expectedStatus||target.status===body.status))fail(409,"ACCOUNT_CHANGED","Account status changed. Refresh details.");
    const status=operation==="revoke"?target.status:body.status;
    const changed=await users.updateOne({_id:targetId,role:target.role,status:target.status,securityVersion:target.securityVersion??null},{$set:{status,securityVersion:randomUUID(),updatedAt:new Date()}},{session});
    if(changed.modifiedCount!==1)fail(409,"ACCOUNT_CHANGED","Account changed. Refresh details.");
    if(operation!=="revoke"&&status==="suspended"&&target.role==="reviewer"){
      const task=await db.collection("address_requests").findOne({...activeReview,"reviewAssignment.reviewerId":targetId},{session,projection:{_id:1}});
      if(task)fail(409,"REVIEWER_HAS_OPEN_WORK","Reviewer has open review work. Resolve it before suspension.");
    }
    const revoked=await db.collection("sessions").deleteMany({userId:targetId},{session});
    return {userId:String(targetId),status,revokedSessions:revoked.deletedCount};
  });
}
router.post(`${BASE}/users/:userId/status`, ...adminAccess,trusted,rejectUnexpectedQuery,handler(req=>accountSecurity(req,parse(statusSchema,req.body),"status")));
router.post(`${BASE}/users/:userId/revoke-sessions`, ...adminAccess,trusted,rejectUnexpectedQuery,handler(req=>accountSecurity(req,parse(emptySchema,req.body),"revoke")));
router.get(`${BASE}/audit-events`, ...adminAccess, handler(async req=>{
  const q=parse(auditSchema,req.query),filter={};
  if(q.action)filter.action=q.action;
  if(q.result)filter.result=q.result;
  if(q.actorId)filter.userId={$in:[oid(q.actorId),q.actorId]};
  // Do not create an audit event on every page of the audit viewer itself.
  return paged(getAuditDB().collection("audit_events"),filter,q,{_id:1,userId:1,action:1,result:1,targetId:1,requestId:1,createdAt:1},r=>({eventId:String(r._id),actorId:r.userId?String(r.userId):null,action:r.action,result:r.result,targetId:r.targetId?String(r.targetId):null,requestId:r.requestId??null,createdAt:iso(r.createdAt)}));
}));
router.get(`${BASE}/localities`, ...adminAccess,handler(async req=>{
  const q=parse(localitySchema,req.query),filter={};
  if(q.q){const re={$regex:escapeRegex(q.q),$options:"i"};filter.$or=[{id:re},{nameEn:re},{nameBn:re},{areaEn:re},{areaBn:re},{districtEn:re},{districtBn:re}];}
  return paged(getMainDB().collection("localities"),filter,q,{_id:1,id:1,nameEn:1,nameBn:1,areaEn:1,districtEn:1,divisionEn:1,approved:1,aliases:1,landmarks:1,datasetVersion:1},r=>({localityId:r.id,nameEn:r.nameEn,nameBn:r.nameBn,areaEn:r.areaEn,districtEn:r.districtEn,divisionEn:r.divisionEn,approved:r.approved===true,aliasCount:Array.isArray(r.aliases)?r.aliases.length:0,landmarkCount:Array.isArray(r.landmarks)?r.landmarks.length:0,datasetVersion:r.datasetVersion??null}));
}));
export default router;
