// No credentials required. Verifies basic transport and static route response only.
import assert from "node:assert/strict";
const origin=process.argv[2];const url=new URL(origin);
assert.equal(url.protocol,"https:");assert.equal(url.origin,origin);
for(const endpoint of ["/","/login/","/share/","/dashboard/admin/"]){const r=await fetch(origin+endpoint,{redirect:"error",signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);assert.match(r.headers.get("content-type")??"",/text\/html/i);assert.match(r.headers.get("content-security-policy")??"",/script-src 'self'/);assert.match(r.headers.get("cache-control")??"",/no-store/i);console.log("[PASS] HTTPS static page",endpoint);}
const health=await fetch(origin+"/api/v1/health",{redirect:"error",signal:AbortSignal.timeout(20000)});assert.equal(health.status,200);assert.equal((await health.json()).status,"operational");
const denied=await fetch(origin+"/api/v1/p14/admin/access",{redirect:"error",signal:AbortSignal.timeout(20000)});assert.equal(denied.status,401);assert.match(denied.headers.get("cache-control")??"",/no-store/i);
const bad=await fetch(origin+"/api/v1/p14/shares/resolve",{method:"POST",headers:{Origin:"https://untrusted.example", "Content-Type":"application/json"},body:JSON.stringify({token:"0".repeat(64)}),redirect:"error",signal:AbortSignal.timeout(20000)});assert.equal(bad.status,403);
console.log("[PASS] Live HTTPS, API health, anonymous denial and origin enforcement. Browser login and workflow still require manual smoke tests.");
