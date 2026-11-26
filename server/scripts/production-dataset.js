import fs from "node:fs";
import { z } from "zod";
import { env } from "../src/config/env.js";
import { connectDatabases,closeDatabases,getMainDB } from "../src/config/database.js";
const text=z.string().trim().min(1).max(500);
const names=["nameEn","nameBn","areaEn","areaBn","districtEn","districtBn","divisionEn","divisionBn"];
const terms=["aliases","areaAliases","districtAliases","landmarks"];
const schema=z.object({id:z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,79}$/).refine(v=>!v.startsWith("BD-TEST-")),...Object.fromEntries(names.map(k=>[k,text])),...Object.fromEntries(terms.map(k=>[k,z.array(text).max(200)])),source:text,precision:text,datasetVersion:text,approved:z.literal(true)}).strict();
const [command,file,confirm]=process.argv.slice(2);
if(!file||!(["export","import"].includes(command)))throw new Error("Usage: node scripts/production-dataset.js export <file> | import <reviewed-file> --approved-reviewed-dataset");
if(command==="export"&&env.NODE_ENV!=="development")throw new Error("Export only from the reviewed development reference dataset.");
if(command==="import"&&(env.NODE_ENV!=="production"||confirm!=="--approved-reviewed-dataset"))throw new Error("Explicit production dataset approval required.");
try{
 await connectDatabases();const db=getMainDB(),col=db.collection("localities");
 if(command==="export"){
  const projection={_id:0,id:1,approved:1,source:1,precision:1,datasetVersion:1,...Object.fromEntries([...names,...terms].map(k=>[k,1]))};
  const records=await col.find({approved:true,id:{$not:/^BD-TEST-/}},{projection,maxTimeMS:10000}).sort({id:1}).limit(1001).toArray();
  const validated=z.array(schema).min(1).max(1000).parse(records);
  fs.writeFileSync(file,JSON.stringify(validated,null,2)+"\n",{flag:"wx",mode:0o600});console.log(`[SUCCESS] ${validated.length} approved reference records exported; review every source before import.`);
 }else{
  if(fs.statSync(file).size>10*1024*1024)throw new Error("Dataset too large.");
  const records=z.array(schema).min(1).max(1000).parse(JSON.parse(fs.readFileSync(file,"utf8")));
  if(new Set(records.map(x=>x.id)).size!==records.length)throw new Error("Duplicate locality ID.");
  if(new Set(records.map(x=>x.datasetVersion)).size!==1||new Set(records.map(x=>x.precision)).size!==1)throw new Error("Inconsistent dataset version or precision.");
  const session=db.client.startSession();try{await session.withTransaction(async()=>{
   if(await col.countDocuments({},{session}))throw new Error("Import requires a fresh empty locality collection. No existing data was modified.");
   const now=new Date();await col.insertMany(records.map(x=>({...x,createdAt:now,updatedAt:now})),{session,ordered:true});
  },{readConcern:{level:"snapshot"},writeConcern:{w:"majority"},readPreference:"primary"});}finally{await session.endSession();}
  console.log(`[SUCCESS] ${records.length} reviewed locality records imported.`);
 }
}catch(e){console.error("[DATASET_FAILED]",e.name);process.exitCode=1;}finally{await closeDatabases();}
