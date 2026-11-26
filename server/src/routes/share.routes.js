import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { getMainDB } from "../config/database.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { recordAudit } from "../services/audit.service.js";
import { decryptData, addressAAD } from "../utils/encryption.js";

const router = Router();
const BASE = "/p14/shares";
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const createSchema = z.object({jobId:id, revision:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), expiresInMinutes:z.union([z.literal(15),z.literal(60),z.literal(1440)])}).strict();
const resolveSchema = z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const db = () => getMainDB();
const tokens = () => db().collection("share_tokens");
const digest = token => createHash("sha256").update(token).digest("hex");
const opts = {maxTimeMS:5000};
const noStore = (req,res,next) => {res.setHeader("Cache-Control","no-store");res.setHeader("Referrer-Policy","no-referrer");next();};
const fail = (res,status,code,message) => res.status(status).json({success:false,code,message});
const invalid = res => fail(res,400,"INVALID_SHARE_REQUEST","Invalid sharing request.");
const missing = res => fail(res,404,"SHARE_UNAVAILABLE","This shared address is unavailable or has expired.");
function trusted(req,res,next){if(req.get("Origin")!==env.CLIENT_URL)return fail(res,403,"UNTRUSTED_ORIGIN","Request origin is not allowed.");next();}
function noQuery(req,res,next){if(Object.keys(req.query).length)return invalid(res);next();}
const limiter = rateLimit({windowMs:60000,limit:20,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>String(req.user._id),message:{success:false,code:"SHARE_RATE_LIMIT",message:"Too many sharing requests."}});
const publicLimiter = rateLimit({windowMs:60000,limit:30,standardHeaders:true,legacyHeaders:false,message:{success:false,code:"SHARE_RATE_LIMIT",message:"Too many sharing requests."}});
const own = [noStore,requireAuth,requireRole("merchant"),limiter,noQuery];
const names = ["nameEn","nameBn","areaEn","areaBn","districtEn","districtBn","divisionEn","divisionBn"];
async function addressFor(ownerId,jobId){return db().collection("address_requests").findOne({_id:jobId,ownerId,status:"confirmed",decision:"confirmed"},{...opts,projection:{ownerId:1,revision:1,encryptedPayload:1}});}
function publicAddress(record){const payload=decryptData(record.encryptedPayload,env.ADDRESS_ENCRYPTION_KEY,addressAAD(record._id,record.ownerId));const locality=payload.selectedCandidate?.locality;if(typeof payload.originalAddress!=="string"||!locality||names.some(key=>typeof locality[key]!=="string"))throw new Error("Invalid confirmed address");return {originalAddress:payload.originalAddress,locality:Object.fromEntries(names.map(key=>[key,locality[key]]))};}
async function audit(req,action,result,targetId,userId=req.user?._id??null){await recordAudit({req,action,result,targetId,userId});}
router.post(BASE,...own,trusted,async(req,res)=>{
 const parsed=createSchema.safeParse(req.body);if(!parsed.success)return invalid(res);
 const {revision,expiresInMinutes}=parsed.data,jobId=new ObjectId(parsed.data.jobId),ownerId=req.user._id;
 const record=await addressFor(ownerId,jobId);if(!record)return missing(res);
 if((record.revision??0)!==revision)return fail(res,409,"REVISION_CONFLICT","The address changed. Refresh before sharing.");
 publicAddress(record); // Verify integrity and confirmed selection before issuing a capability.
 const token=randomBytes(32).toString("hex"),shareId=new ObjectId(),createdAt=new Date(),expiresAt=new Date(createdAt.getTime()+expiresInMinutes*60000);
 await audit(req,"ADDRESS_SHARE_CREATE","started",shareId);
 await tokens().insertOne({_id:shareId,tokenHash:digest(token),ownerId,jobId,revision,addressIv:record.encryptedPayload.iv,securityVersion:req.user.securityVersion??null,createdAt,expiresAt,revokedAt:null});
 try{await audit(req,"ADDRESS_SHARE_CREATE","success",shareId);}catch(error){await tokens().updateOne({_id:shareId},{$set:{revokedAt:new Date()}});throw error;}
 return res.status(201).json({success:true,shareId:String(shareId),token,expiresAt:expiresAt.toISOString()});
});
router.get(`${BASE}/address/:jobId`,...own,async(req,res)=>{
 if(!id.safeParse(req.params.jobId).success)return invalid(res);
 const jobId=new ObjectId(req.params.jobId),ownerId=req.user._id;
 if(!await db().collection("address_requests").findOne({_id:jobId,ownerId},{projection:{_id:1},...opts}))return missing(res);
 const records=await tokens().find({jobId,ownerId,revokedAt:null,expiresAt:{$gt:new Date()}},{projection:{_id:1,expiresAt:1,createdAt:1},...opts}).sort({_id:-1}).limit(50).toArray();
 return res.json({success:true,items:records.map(x=>({shareId:String(x._id),expiresAt:x.expiresAt,createdAt:x.createdAt}))});
});
router.post(`${BASE}/:shareId/revoke`,...own,trusted,async(req,res)=>{
 if(!id.safeParse(req.params.shareId).success||!z.object({}).strict().safeParse(req.body).success)return invalid(res);
 const shareId=new ObjectId(req.params.shareId),ownerId=req.user._id;
 const filter={_id:shareId,ownerId,revokedAt:null};
 if(!await tokens().findOne(filter,{projection:{_id:1},...opts}))return missing(res);
 await audit(req,"ADDRESS_SHARE_REVOKE","started",shareId);
 const r=await tokens().updateOne(filter,{$set:{revokedAt:new Date()}});if(!r.modifiedCount)return missing(res);
 let auditRecorded=true;try{await audit(req,"ADDRESS_SHARE_REVOKE","success",shareId);}catch{auditRecorded=false;}
 return res.json({success:true,auditRecorded});
});
router.post(`${BASE}/address/:jobId/revoke-all`,...own,trusted,async(req,res)=>{
 if(!id.safeParse(req.params.jobId).success||!z.object({}).strict().safeParse(req.body).success)return invalid(res);
 const jobId=new ObjectId(req.params.jobId),ownerId=req.user._id;
 if(!await db().collection("address_requests").findOne({_id:jobId,ownerId},{projection:{_id:1},...opts}))return missing(res);
 await audit(req,"ADDRESS_SHARE_REVOKE_ALL","started",jobId);
 const r=await tokens().updateMany({jobId,ownerId,revokedAt:null},{$set:{revokedAt:new Date()}});
 let auditRecorded=true;try{await audit(req,"ADDRESS_SHARE_REVOKE_ALL","success",jobId);}catch{auditRecorded=false;}
 return res.json({success:true,revoked:r.modifiedCount,auditRecorded});
});
router.post(`${BASE}/resolve`,noStore,trusted,publicLimiter,noQuery,async(req,res)=>{
 const p=resolveSchema.safeParse(req.body);if(!p.success)return invalid(res);
 const hash=digest(p.data.token);
 const record=await tokens().findOne({tokenHash:hash,revokedAt:null,expiresAt:{$gt:new Date()}},opts);if(!record)return missing(res);
 const ownerFilter={_id:record.ownerId,role:"merchant",status:"active",securityVersion:record.securityVersion??null};
 const owners=db().collection("users");if(!await owners.findOne(ownerFilter,{projection:{_id:1},...opts}))return missing(res);
 const address=await addressFor(record.ownerId,record.jobId);
 if(!address||(address.revision??0)!==record.revision||address.encryptedPayload.iv!==record.addressIv)return missing(res);
 const item=publicAddress(address);
 await audit(req,"ADDRESS_SHARE_ACCESS","success",record._id,null);
 // Recheck after the audit; already-running requests cannot be globally canceled.
 const [stillValid,stillOwner,stillAddress]=await Promise.all([
 tokens().findOne({_id:record._id,tokenHash:hash,revokedAt:null,expiresAt:{$gt:new Date()}},{projection:{_id:1},...opts}),
 owners.findOne(ownerFilter,{projection:{_id:1},...opts}),
 addressFor(record.ownerId,record.jobId),
 ]);
 if(!stillValid||!stillOwner||!stillAddress||(stillAddress.revision??0)!==record.revision||stillAddress.encryptedPayload.iv!==record.addressIv)return missing(res);
 return res.json({success:true,item,expiresAt:record.expiresAt});
});
export async function initializeShareIndexes(){await Promise.all([
 tokens().createIndex({tokenHash:1},{unique:true,name:"share_token_hash"}),
 tokens().createIndex({expiresAt:1},{expireAfterSeconds:0,name:"share_expiry"}),
 tokens().createIndex({ownerId:1,jobId:1,_id:-1},{name:"share_owner_address"}),
 ]);}
export default router;
