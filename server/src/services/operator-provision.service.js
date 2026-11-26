import { randomUUID } from "node:crypto";
import { getMainDB } from "../config/database.js";
import { recordAudit } from "./audit.service.js";
export async function provisionDedicatedAccount(email,role,action,{productionBootstrap=false}={}){
 if(!["admin","reviewer","data_manager"].includes(role))throw new Error("Invalid operator role.");
 if(process.env.NODE_ENV!=="development"&&!(process.env.NODE_ENV==="production"&&productionBootstrap&&role==="admin"&&process.env.ALLOW_ADMIN_BOOTSTRAP==="1"))throw new Error("Operator provisioning is restricted to development or explicitly authorized offline admin bootstrap.");
 const db=getMainDB(),session=db.client.startSession(),req={requestId:randomUUID()};let targetId=null;
 const audit=result=>recordAudit({req,userId:null,action,result,targetId});
 try{
  const user=await db.collection("users").findOne({email,role:"merchant",status:"active"},{projection:{_id:1}});
  if(!user){const e=new Error("An active dedicated merchant account is required.");e.code="ACCOUNT_NOT_ELIGIBLE";throw e;}
  targetId=user._id;await audit("started");
  await session.withTransaction(async()=>{
   const r=await db.collection("users").updateOne({_id:targetId,role:"merchant",status:"active"},{$set:{role,securityVersion:randomUUID(),updatedAt:new Date()}},{session});
   if(r.modifiedCount!==1){const e=new Error("Account provisioning conflict.");e.code="PROVISION_CONFLICT";throw e;}
   if(await db.collection("address_requests").findOne({ownerId:targetId},{session,projection:{_id:1}})){const e=new Error("Use a dedicated account without existing addresses.");e.code="ACCOUNT_HAS_ADDRESSES";throw e;}
   await db.collection("sessions").deleteMany({userId:targetId},{session});
  },{readConcern:{level:"snapshot"},writeConcern:{w:"majority"},readPreference:"primary",maxCommitTimeMS:10000});
 }catch(e){if(targetId)try{await audit(e.code==="ACCOUNT_HAS_ADDRESSES"||e.code==="PROVISION_CONFLICT"?"denied":"unconfirmed");}catch{console.error("[OPERATOR_AUDIT_UNAVAILABLE]",req.requestId);}throw e;}finally{await session.endSession();}
 let auditRecorded=true;try{await audit("success");}catch{auditRecorded=false;console.error("[OPERATOR_FINAL_AUDIT_UNAVAILABLE]",req.requestId);}
 return {success:true,userId:String(targetId),role,auditRecorded,message:`${role} account provisioned successfully. Sign in again.`};
}
