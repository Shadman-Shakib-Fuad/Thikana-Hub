/* Development-only combined build, browser, and regression runner. */
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const net = require("node:net");
const root = path.resolve(__dirname,"..");
const server = path.join(root,"server");
const node = process.execPath;
const children = new Set();
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
let interrupted=false;
function start(args,cwd=root){const child=spawn(node,args,{cwd,stdio:"inherit",windowsHide:true,detached:process.platform!=="win32",env:{...process.env,THIKANAHUB_BROWSER:"chromium"}});children.add(child);child.once("exit",()=>children.delete(child));child.on("error",e=>console.error("[PROCESS ERROR]",e.code??e.name));return child;}
async function stop(child){if(!child||child.exitCode!==null||child.signalCode!==null)return;try{if(process.platform==="win32")spawnSync("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});else process.kill(-child.pid,"SIGTERM");}catch{}await Promise.race([new Promise(r=>child.once("exit",r)),sleep(3000)]);if(child.exitCode===null&&child.signalCode===null){try{if(process.platform==="win32")child.kill();else process.kill(-child.pid,"SIGKILL");}catch{}}}
async function run(label,args,cwd=root,timeout=900000){console.log(`\n========== ${label} ==========`);const c=start(args,cwd);let timer;try{await new Promise((resolve,reject)=>{timer=setTimeout(()=>{reject(new Error(`${label} timed out`));},timeout);c.once("error",reject);c.once("exit",(code,signal)=>code===0?resolve():reject(new Error(`${label} failed (${code??signal})`)));});console.log(`[PASS] ${label}`);}finally{clearTimeout(timer);await stop(c);}}
async function checkPort(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once("error",()=>reject(new Error(`Port ${port} is occupied. Stop existing development servers and rerun.`)));s.listen(port,"127.0.0.1",()=>s.close(resolve));});}
async function ready(child,url,check,label){for(let i=0;i<90;i++){if(interrupted||child.exitCode!==null||child.signalCode!==null)throw new Error(`${label} exited before readiness`);try{const r=await fetch(url,{signal:AbortSignal.timeout(3000),cache:"no-store"});if(r.ok&&await check(r)){console.log(`[READY] ${label}`);return;}}catch{}await sleep(1000);}throw new Error(`${label} readiness timeout`);}
async function backend(){await checkPort(5000);const c=start(["src/index.js"],server);await ready(c,"http://127.0.0.1:5000/api/v1/health",async r=>(await r.json()).service==="ThikanaHub API","Backend");return c;}
async function main(){assert.ok(process.versions.node.split(".")[0]>=22,"Node 22+ required");assert.ok(fs.existsSync(path.join(server,".env")),"Existing server/.env is required");for(const p of ["node_modules/next/dist/bin/next","node_modules/typescript/bin/tsc","node_modules/eslint/bin/eslint.js","node_modules/@playwright/test/cli.js","server/node_modules/mongodb"]){assert.ok(fs.existsSync(path.join(root,p)),`Existing dependency missing: ${p}. Install project dependencies before testing.`);}
  await checkPort(3000);await checkPort(5000);
  await run("Development environment guard",["--input-type=module","-e",`import assert from 'node:assert/strict';import {env} from './src/config/env.js';assert.equal(env.NODE_ENV,'development');assert.equal(process.env.NODE_ENV,'development');assert.equal(env.CLIENT_URL,'http://localhost:3000');assert.equal(env.PORT,5000);console.log('[PASS] Local development settings verified. Use only a development database.');`],server,30000);
  await run("Backend source syntax",["--check","src/routes/admin-management.routes.js"],server,30000);
  await run("Admin frontend lint",["node_modules/eslint/bin/eslint.js","src/components/admin","src/app/dashboard/admin","src/components/data-manager/DataManagerEntry.tsx"]);
  await run("Frontend production build",["node_modules/next/dist/bin/next","build"],root,600000);
  await run("TypeScript verification",["node_modules/typescript/bin/tsc","--noEmit"],root,180000);
  let back,front;
  try{back=await backend();front=start(["node_modules/next/dist/bin/next","dev","--hostname","localhost","--port","3000"]);await ready(front,"http://localhost:3000/login/",async()=>true,"Frontend");
    const pw=["node_modules/@playwright/test/cli.js","test","--workers=1","--retries=0","--reporter=list"];
    await run("New Admin master browser integration",[...pw,"tests/admin-master-flow.spec.mjs"],root,900000);
    await stop(back);await sleep(1500);back=await backend();
    await run("Role-security regression",["scripts/test-admin-role-assignment.js"],server,600000);
    await stop(back);await sleep(1500);back=await backend();
    await run("Data Manager workflow regression",[...pw,"tests/data-manager-flow.spec.mjs"],root,900000);
    if(process.argv.includes("--extended")){
      for(const script of ["test-admin-foundation.js","test-admin-statistics.js","test-admin-users.js"]){await stop(back);await sleep(1500);back=await backend();await run(script,[`scripts/${script}`],server,600000);}
      await stop(back);await sleep(1500);back=await backend();await run("Reviewer browser regression",[...pw,"tests/reviewer-flow.spec.mjs"],root,900000);
    }
  }finally{await stop(front);await stop(back);}
  console.log("\n========================================\nALL PHASE 10 MASTER CHECKS PASSED\n========================================");
}
for(const sig of ["SIGINT","SIGTERM"])process.once(sig,()=>{interrupted=true;Promise.all([...children].map(stop)).finally(()=>process.exit(130));});
main().catch(e=>{console.error("[MASTER FAILED]",e.message);process.exitCode=1;}).finally(async()=>{await Promise.all([...children].map(stop));});
