import { test,expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
const WEB="http://localhost:3000",API="http://localhost:5000/api/v1",BASE="/p14/shares",roles=["merchant","reviewer","manager","admin"];
test.use({trace:"off",screenshot:"off",video:"off"});
function cli(args,input){const r=spawnSync(process.execPath,args,{cwd:"server",input,encoding:"utf8",timeout:90000,windowsHide:true,env:{...process.env,THIKANAHUB_BROWSER_FIXTURES:"1"}});if(r.stdout)console.log(r.stdout.trim());if(r.status!==0||r.error)throw new Error(`Development fixture command failed (${r.error?.code??r.status})`);}
async function api(c,endpoint,{method="GET",body,expected=200,origin=WEB}={}){const r=await c.request.fetch(API+endpoint,{method,headers:{Origin:origin,Accept:"application/json",Connection:"close"},...(body===undefined?{}:{data:body}),timeout:45000,maxRetries:0,failOnStatusCode:false});const d=await r.json();console.log(`[API] ${method} ${endpoint} -> ${r.status()}`);expect(r.status(),d.code??d.message).toBe(expected);expect(d.success).toBe(r.ok());if(endpoint.startsWith(BASE))expect(r.headers()["cache-control"]).toContain("no-store");return d;}
async function step(name,fn){await test.step(name,fn);console.log(`[PASS] ${name}`);}
test("Expiring single-address sharing workflow",async({browser})=>{
 test.setTimeout(420000);const marker=randomBytes(8).toString("hex"),accounts=Object.fromEntries(roles.map(role=>[role,{email:`dm-browser-${role}-${marker}@example.com`,password:randomBytes(24).toString("hex")}])) ;console.log("TEST FIXTURE MARKER:",marker);const owner=await browser.newContext(),other=await browser.newContext(),anon=await browser.newContext();let jobId,link,token,shareId,primaryError;const original=`Synthetic ${marker}, Kazipara, Mirpur, Dhaka`;
 const create=async()=>api(owner,BASE,{method:"POST",expected:201,body:{jobId,revision:0,expiresInMinutes:15}});
 const resolve=(value,expected=200)=>api(anon,`${BASE}/resolve`,{method:"POST",expected,body:{token:value}});
 try{
 await step("1/6 Owner, confirmed address and input authorization",async()=>{
  cli(["scripts/create-data-manager-browser-fixtures.js",marker],JSON.stringify(Object.fromEntries(roles.map(r=>[r,accounts[r].password]))));
  await api(owner,"/auth/login",{method:"POST",body:accounts.merchant});await api(other,"/auth/login",{method:"POST",body:accounts.reviewer});
  const r=await api(owner,"/p14/address-resolutions",{method:"POST",expected:201,body:{address:original}});jobId=r.jobId;expect(r.candidates.length).toBeGreaterThan(0);
  const body={jobId,revision:0,expiresInMinutes:15};await api(owner,BASE,{method:"POST",expected:404,body});await api(anon,BASE,{method:"POST",expected:401,body});
  await api(owner,"/p14/address-feedback",{method:"POST",body:{jobId,decision:"confirmed",localityId:r.candidates[0].localityId,revision:0}});
  await api(owner,`/p14/saved-addresses/${jobId}`,{method:"PATCH",body:{saved:true,revision:0}});
  await api(other,BASE,{method:"POST",expected:404,body});await api(owner,BASE,{method:"POST",expected:403,origin:"https://untrusted.example",body});await api(owner,BASE,{method:"POST",expected:400,body:{...body,ownerId:"injected"}});await api(owner,BASE,{method:"POST",expected:409,body:{...body,revision:1}});
 });
 await step("2/6 Owner browser creates link with explicit consent",async()=>{
  const page=await owner.newPage();await page.goto(`${WEB}/dashboard/saved/`);const card=page.locator("article").filter({hasText:original});await expect(card).toBeVisible({timeout:30000});await card.getByRole("button",{name:"Manage Address",exact:true}).click();const region=page.getByRole("region",{name:"Secure address sharing"});await expect(region).toBeVisible({timeout:30000});const button=region.getByRole("button",{name:"Create sharing link",exact:true});await expect(button).toBeDisabled();await region.getByLabel("I agree to share this original address and confirmed locality.").check();const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1${BASE}`&&r.request().method()==="POST"),button.click()]);expect(response.status()).toBe(201);const data=await response.json();token=data.token;shareId=data.shareId;expect(token).toMatch(/^[a-f0-9]{64}$/);link=`${WEB}/share/#${token}`;await expect(region.getByLabel("Sharing link")).toHaveValue(link);await page.close();
 });
 await step("3/6 Anonymous browser and minimal public response",async()=>{
  const data=await resolve(token);expect(Object.keys(data.item).sort()).toEqual(["locality","originalAddress"]);expect(data.item.originalAddress).toBe(original);expect(Object.keys(data.item.locality).length).toBe(8);
  const page=await anon.newPage();await page.goto(link);await page.getByRole("button",{name:"View shared address",exact:true}).click();await expect(page.getByText(original,{exact:true})).toBeVisible({timeout:30000});expect(new URL(page.url()).hash).toBe("");await page.close();
  await resolve((token[0]==="0"?"1":"0")+token.slice(1),404);await resolve("bad",400);
 });
 await step("4/6 Revocation and list ownership",async()=>{
  const list=await api(owner,`${BASE}/address/${jobId}`);expect(list.items.some(x=>x.shareId===shareId)).toBe(true);expect(list.items.every(x=>Object.keys(x).sort().join(",")==="createdAt,expiresAt,shareId")).toBe(true);await api(other,`${BASE}/address/${jobId}`,{expected:404});await api(other,`${BASE}/${shareId}/revoke`,{method:"POST",expected:404,body:{}});await api(owner,`${BASE}/${shareId}/revoke`,{method:"POST",body:{}});await resolve(token,404);
 });
 await step("5/6 Expiry and database hash-only storage",async()=>{
  const exp=await create();
  // Exact current synthetic fixture only; no raw token passed to database or printed.
  cli(["--input-type=module","-e",`import assert from 'node:assert/strict';import {ObjectId} from 'mongodb';import {createHash} from 'node:crypto';import {connectDatabases,getMainDB,closeDatabases,getAuditDB} from './src/config/database.js';import {env} from './src/config/env.js';import fs from 'node:fs';assert.equal(env.NODE_ENV,'development');assert.equal(env.CLIENT_URL,'http://localhost:3000');assert.equal(process.env.THIKANAHUB_BROWSER_FIXTURES,'1');const input=JSON.parse(fs.readFileSync(0,'utf8'));assert.match(input.marker,/^[a-f0-9]{16}$/);try{await connectDatabases();const db=getMainDB();const owner=await db.collection('users').findOne({email:'dm-browser-merchant-'+input.marker+'@example.com',name:'DM Browser Test merchant'},{projection:{_id:1}});assert.ok(owner);const filter={_id:new ObjectId(input.shareId),ownerId:owner._id};const share=await db.collection('share_tokens').findOne(filter);assert.ok(share);assert.equal(share.tokenHash,createHash('sha256').update(input.token).digest('hex'));assert.ok(!JSON.stringify(share).includes(input.token));assert.ok(await getAuditDB().collection('audit_events').findOne({action:'ADDRESS_SHARE_CREATE',result:'success',targetId:share._id,userId:owner._id}));assert.equal((await db.collection('share_tokens').updateOne(filter,{$set:{expiresAt:new Date(Date.now()-1000)}})).modifiedCount,1);console.log('[PASS] Hash-only storage, audit persistence and synthetic expiry fixture verified.');}finally{await closeDatabases();}`],JSON.stringify({marker,shareId:exp.shareId,token:exp.token}));await resolve(exp.token,404);
 });
 await step("6/6 Revoke all and edit invalidation",async()=>{
  const a=await create(),b=await create();await api(owner,`${BASE}/address/${jobId}/revoke-all`,{method:"POST",body:{}});await resolve(a.token,404);await resolve(b.token,404);
  const c=await create();await api(owner,`/p14/address-requests/${jobId}`,{method:"PATCH",body:{address:`${original} edited`,revision:0}});await resolve(c.token,404);await api(owner,"/auth/logout",{method:"POST"});await api(owner,BASE,{method:"POST",expected:401,body:{jobId,revision:0,expiresInMinutes:15}});
 });
 }catch(e){primaryError=e;throw e;}finally{for(const c of [owner,other,anon])await c.close().catch(()=>{});try{cli(["scripts/cleanup-data-manager-browser.js",marker]);}catch(e){if(!primaryError)throw e;console.error("[CLEANUP FAILED]",marker);}}
 console.log("ALL 6 PHASE 11 SHARE TEST GROUPS PASSED");
});
