import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
const WEB = "http://localhost:3000";
const API = "http://localhost:5000/api/v1";
const BASE = "/p14/admin";
const DM = "/p14/data-manager";
const roles = ["merchant", "reviewer", "manager", "admin"];
test.use({ trace:"off", screenshot:"off", video:"off", viewport:{width:1440,height:900} });
function cli(script,args=[],input){const result=spawnSync(process.execPath,[`scripts/${script}`,...args],{cwd:"server",input,encoding:"utf8",timeout:90000,windowsHide:true,maxBuffer:1024*1024,env:{...process.env,THIKANAHUB_BROWSER_FIXTURES:"1"}});if(result.stdout)console.log(result.stdout.trim());if(result.status!==0||result.error)throw new Error(`Fixture CLI failed: ${script} (${result.error?.code??result.status})`);}
function makeFixture(){const marker=randomBytes(8).toString("hex");return {marker,accounts:Object.fromEntries(roles.map(r=>[r,{email:`dm-browser-${r}-${marker}@example.com`,password:randomBytes(24).toString("hex")}]))};}
function prepare(fixture){cli("create-data-manager-browser-fixtures.js",[fixture.marker],JSON.stringify(Object.fromEntries(roles.map(r=>[r,fixture.accounts[r].password]))));}
async function api(context,endpoint,{method="GET",body,expected=200,origin=WEB}={}){const response=await context.request.fetch(API+endpoint,{method,headers:{Accept:"application/json",Origin:origin},...(body===undefined?{}:{data:body}),timeout:45000,maxRetries:0,failOnStatusCode:false});const data=await response.json();console.log(`[API] ${method} ${endpoint} -> ${response.status()}`);expect(Array.isArray(expected)?expected:[expected],data.code??data.message).toContain(response.status());expect(data.success).toBe(response.ok());if(endpoint.startsWith(BASE))expect(response.headers()["cache-control"]).toContain("no-store");return {data,status:response.status()};}
async function login(context,account){return (await api(context,"/auth/login",{method:"POST",body:account})).data.user;}
async function createReview(context,marker){const {data}=await api(context,"/p14/address-resolutions",{method:"POST",expected:201,body:{address:`Synthetic ${marker}, Kazipara, Mirpur, Dhaka`}});await api(context,"/p14/address-feedback",{method:"POST",body:{jobId:data.jobId,decision:"no_correct_match",revision:0}});return data.jobId;}
async function clickPost(page,endpoint,locator){const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1${endpoint}`&&r.request().method()==="POST",{timeout:45000}),locator.click()]);const data=await response.json();expect(response.status(),data.code??data.message).toBe(200);expect(data.success).toBe(true);if("auditRecorded" in data)expect(data.auditRecorded).toBe(true);return data;}
async function step(name,fn){await test.step(name,fn);console.log(`[PASS] ${name}`);}
test("Complete Phase 10 administrator workflow",async({browser})=>{
  test.setTimeout(720000);
  const a=makeFixture(),b=makeFixture();const attempted=[],contexts=[];let primaryError;
  console.log("TEST FIXTURE MARKERS:",a.marker,b.marker);
  const makeContext=async()=>{const c=await browser.newContext();contexts.push(c);return c;};
  const admin=await makeContext(),merchant=await makeContext(),reviewer=await makeContext(),manager=await makeContext(),spare=await makeContext(),anonymous=await makeContext();
  const localityId=`BD-TEST-BROWSER-${a.marker.toUpperCase()}`;
  let adminUser,merchantUser,reviewerUser,spareUser,jobId,proposalId,termId;
  const page=await admin.newPage();page.setDefaultTimeout(30000);page.on("dialog",d=>d.accept());
  const nav=label=>page.getByRole("navigation",{name:"Admin navigation"}).getByRole("button",{name:label,exact:true}).click();
  const findUser=async email=>{await page.getByLabel("Search users",{exact:true}).fill(email);await page.getByRole("button",{name:"Search",exact:true}).click();await page.getByRole("row").filter({hasText:email}).getByRole("button",{name:"Manage",exact:true}).click();};
  try{
    await step("1/8 Fixture setup, login and access isolation",async()=>{
      attempted.push(a);prepare(a);attempted.push(b);prepare(b);
      cli("admin-provision.js",["provision",a.accounts.admin.email]);cli("reviewer-admin.js",["provision",a.accounts.reviewer.email]);cli("data-manager-admin.js",["provision",a.accounts.manager.email]);
      merchantUser=await login(merchant,a.accounts.merchant);reviewerUser=await login(reviewer,a.accounts.reviewer);await login(manager,a.accounts.manager);spareUser=await login(spare,b.accounts.merchant);
      for(const endpoint of ["/review-queue","/reviewers","/audit-events","/localities"]){await api(anonymous,BASE+endpoint,{expected:401});await api(merchant,BASE+endpoint,{expected:403});}
      const deniedPage=await merchant.newPage();await deniedPage.goto(`${WEB}/dashboard/admin/`);await expect(deniedPage).not.toHaveURL(/\/dashboard\/admin\/?$/,{timeout:30000});await deniedPage.close();
      await page.goto(`${WEB}/login/`);const form=page.locator("form").filter({has:page.locator('input[type="email"]')});await form.locator('input[type="email"]').fill(a.accounts.admin.email);await form.locator('input[type="password"]').fill(a.accounts.admin.password);await form.locator('button[type="submit"]').click();await expect(page).toHaveURL(/\/dashboard\/admin\/?$/,{timeout:45000});await expect(page.getByRole("heading",{name:"System Overview",exact:true})).toBeVisible();await expect(page.getByText("Total users",{exact:true})).toBeVisible({timeout:45000});adminUser=(await api(admin,"/auth/me")).data.user;
    });
    await step("2/8 User directory and actual browser role assignment",async()=>{
      await nav("Users");await findUser(b.accounts.merchant.email);const region=page.getByRole("region",{name:"Selected user"});
      const roleSelect = region.getByLabel("New role");
      const assignButton = region.getByRole("button", {
        name: "Assign role",
        exact: true
      });

      await expect(roleSelect).toBeVisible();
      await expect(roleSelect).toHaveValue("");
      await expect(assignButton).toBeDisabled();

      console.log("[PASS] Explicit role selection required");

      await roleSelect.selectOption("data_manager");
      await expect(assignButton).toBeEnabled();

      const targetName = await region
        .locator("p.text-lg.font-bold")
        .innerText();

      await page.evaluate(() => {
        window.__originalRoleConfirm = window.confirm;
        window.__roleConfirmMessage = "";

        window.confirm = message => {
          window.__roleConfirmMessage = message;
          return false;
        };
      });

      let confirmationMessage;

      try {
        await assignButton.click();
      } finally {
        confirmationMessage = await page.evaluate(() => {
          const message = window.__roleConfirmMessage;

          window.confirm = window.__originalRoleConfirm;

          delete window.__originalRoleConfirm;
          delete window.__roleConfirmMessage;

          return message;
        });
      }

      expect(confirmationMessage).toBe(
        "Assign Data Manager role to " +
        targetName +
        " (" +
        b.accounts.merchant.email +
        ")? Existing sessions will be revoked."
      );

      const unchanged = await api(spare, "/auth/me");
      expect(unchanged.data.user.role).toBe("merchant");

      console.log("[PASS] Detailed confirmation message");
      console.log("[PASS] Cancelled assignment preserves role");

      await findUser(a.accounts.merchant.email);

      await expect(
        region.getByText(a.accounts.merchant.email, {
          exact: true
        })
      ).toBeVisible();

      await expect(roleSelect).toHaveValue("");
      await expect(assignButton).toBeDisabled();

      await findUser(b.accounts.merchant.email);

      await expect(
        region.getByText(b.accounts.merchant.email, {
          exact: true
        })
      ).toBeVisible();

      await expect(roleSelect).toHaveValue("");
      await expect(assignButton).toBeDisabled();

      console.log("[PASS] Account switching resets role selection");

      await roleSelect.selectOption("reviewer");
      await expect(assignButton).toBeEnabled();

      console.log("[PASS] Reviewer selection enabled");
await clickPost(page,`${BASE}/users/${spareUser.id}/role`,region.getByRole("button",{name:"Assign role",exact:true}));await api(spare,"/auth/me",{expected:401});const promoted=await login(spare,b.accounts.merchant);expect(promoted.role).toBe("reviewer");await expect(region.getByText("reviewer",{exact:true})).toBeVisible();
    });

    console.log("[TEST PACING] Waiting for Admin rate-limit window after role safety regression.");
    await new Promise(r => setTimeout(r, 61000));

    await step("3/8 Review metadata, validation and assignment via browser",async()=>{
      jobId=await createReview(merchant,a.marker);const endpoint=`${BASE}/review-queue/${jobId}/assign`;const body={reviewerId:reviewerUser.id,revision:0};
      await api(merchant,endpoint,{method:"POST",body,expected:403});await api(admin,endpoint,{method:"POST",body,origin:"https://untrusted.example.com",expected:403});await api(admin,endpoint,{method:"POST",body:{...body,force:true},expected:400});await api(admin,endpoint,{method:"POST",body:{...body,revision:99},expected:409});await api(admin,endpoint,{method:"POST",body:{...body,reviewerId:merchantUser.id},expected:409});
      const queue=(await api(admin,`${BASE}/review-queue?jobId=${jobId}`)).data;expect(queue.items).toHaveLength(1);expect(Object.keys(queue.items[0]).sort()).toEqual(["jobId","revision","addressStatus","reviewStatus","reviewerId","assignedAt","createdAt"].sort());
      await nav("Review Queue");await page.getByLabel("Request ID",{exact:true}).fill(jobId);await page.getByRole("button",{name:"Search",exact:true}).click();await page.getByRole("row").filter({hasText:jobId}).getByRole("button",{name:"Assign",exact:true}).click();const assign=page.getByRole("region",{name:"Assign reviewer"});await assign.getByRole("row").filter({hasText:a.accounts.reviewer.email}).getByRole("button",{name:"Select",exact:true}).click();await clickPost(page,endpoint,assign.getByRole("button",{name:"Confirm assignment",exact:true}));await api(admin,endpoint,{method:"POST",body,expected:409});const detail=(await api(reviewer,`/p14/reviewer/queue/${jobId}`)).data;expect(detail.jobId).toBe(jobId);expect(detail.reviewStatus).toBe("pending");
    });
    // Keep the actual security rate limits unchanged; the suite crosses several panels.
    console.log("[TEST PACING] Waiting for the administrative rate-limit window to expire.");await new Promise(r=>setTimeout(r,61000));
    await step("4/8 Concurrent assignment and reviewer workload",async()=>{
      const second=await createReview(merchant,a.marker+"-second");const endpoint=`${BASE}/review-queue/${second}/assign`;const results=await Promise.all([reviewerUser.id,reviewerUser.id].map(reviewerId=>api(admin,endpoint,{method:"POST",body:{reviewerId,revision:0},expected:[200,409]})));expect(results.map(r=>r.status).sort()).toEqual([200,409]);const assigned=results.find(r=>r.status===200).data;const reviewers=(await api(admin,`${BASE}/reviewers?limit=50`)).data.items;expect(reviewers.find(r=>r.userId===assigned.reviewerId).pending).toBeGreaterThan(0);await api(admin,`${BASE}/users/${reviewerUser.id}/status`,{method:"POST",body:{status:"suspended",expectedStatus:"active"},expected:409});const third=await createReview(merchant,a.marker+"-race");const [assignment,suspension]=await Promise.all([api(admin,`${BASE}/review-queue/${third}/assign`,{method:"POST",body:{reviewerId:spareUser.id,revision:0},expected:[200,409]}),api(admin,`${BASE}/users/${spareUser.id}/status`,{method:"POST",body:{status:"suspended",expectedStatus:"active"},expected:[200,409]})]);expect([assignment.status,suspension.status].sort()).toEqual([200,409]);if(suspension.status===200){await api(admin,`${BASE}/users/${spareUser.id}/status`,{method:"POST",body:{status:"active",expectedStatus:"suspended"}});console.log("[PASS] Suspension won; assignment was rejected.");}else{console.log("[PASS] Assignment won; suspension was rejected.");}
    });
    await step("5/8 Account suspension, reactivation and session revocation",async()=>{
      await api(admin,`${BASE}/users/${adminUser.id}/status`,{method:"POST",body:{status:"suspended",expectedStatus:"active"},expected:403});await nav("Security");await findUser(a.accounts.merchant.email);const region=page.getByRole("region",{name:"Selected user"});await clickPost(page,`${BASE}/users/${merchantUser.id}/status`,region.getByRole("button",{name:"Suspend account",exact:true}));await api(merchant,"/auth/me",{expected:401});await api(merchant,"/auth/login",{method:"POST",body:a.accounts.merchant,expected:401});await expect(region.getByRole("button",{name:"Reactivate account",exact:true})).toBeVisible();await clickPost(page,`${BASE}/users/${merchantUser.id}/status`,region.getByRole("button",{name:"Reactivate account",exact:true}));await api(merchant,"/auth/me",{expected:401});await login(merchant,a.accounts.merchant);await clickPost(page,`${BASE}/users/${merchantUser.id}/revoke-sessions`,region.getByRole("button",{name:"Revoke all sessions",exact:true}));await api(merchant,"/auth/me",{expected:401});await login(merchant,a.accounts.merchant);
    });
    await step("6/8 Locality approval, term rejection and dataset history",async()=>{
      const names={nameEn:`Synthetic Admin ${a.marker}`,nameBn:"পরীক্ষামূলক এলাকা",areaEn:"Synthetic Area",areaBn:"পরীক্ষামূলক অঞ্চল",districtEn:"Synthetic District",districtBn:"পরীক্ষামূলক জেলা",divisionEn:"Synthetic Division",divisionBn:"পরীক্ষামূলক বিভাগ"};
      proposalId=(await api(manager,`${DM}/locality-proposals`,{method:"POST",expected:201,body:{operation:"create",localityId,locality:names,reason:"Synthetic administrator UI test.",evidence:"Synthetic test evidence only."}})).data.item.proposalId;
      await nav("Approvals");await page.getByRole("row").filter({hasText:proposalId}).getByRole("button",{name:"View proposal",exact:true}).click();let region=page.getByRole("region",{name:"Proposal details"});await expect(region.getByText(names.nameEn,{exact:true})).toBeVisible();await region.getByLabel("Decision reason").fill("Approved synthetic test locality only.");await clickPost(page,`${BASE}/dataset-proposals/locality/${proposalId}/decision`,region.getByRole("button",{name:"Approve proposal",exact:true}));await expect(region.getByText("Dataset changes published.",{exact:true})).toBeVisible();
      await nav("Dataset");await page.getByLabel("Search localities").fill(localityId);await page.getByRole("button",{name:"Search",exact:true}).click();await expect(page.getByRole("row").filter({hasText:localityId})).toContainText(names.nameEn);
      termId=(await api(manager,`${DM}/term-proposals`,{method:"POST",expected:201,body:{localityId,field:"aliases",operation:"add",term:`Synthetic alias ${a.marker}`,reason:"Synthetic administrator UI term test.",evidence:"Synthetic evidence only."}})).data.item.proposalId;
      await nav("Approvals");await page.getByLabel("Proposal type").selectOption("term");await page.getByRole("row").filter({hasText:termId}).getByRole("button",{name:"View proposal",exact:true}).click();region=page.getByRole("region",{name:"Proposal details"});await region.getByLabel("Decision reason").fill("Rejected synthetic alias for integration test.");await clickPost(page,`${BASE}/dataset-proposals/term/${termId}/decision`,region.getByRole("button",{name:"Reject proposal",exact:true}));await expect(region.getByText("Dataset unchanged.",{exact:true})).toBeVisible();await page.getByLabel("Proposal status").selectOption("rejected");await expect(page.getByRole("row").filter({hasText:termId})).toContainText("rejected");
    });
    console.log("[TEST PACING] Waiting for the administrative rate-limit window to expire.");await new Promise(r=>setTimeout(r,61000));
    await step("7/8 Persisted audit evidence and read-only filters",async()=>{
      for(const action of ["ADMIN_ROLE_ASSIGN_REVIEWER","ADMIN_REVIEW_ASSIGN","ADMIN_ACCOUNT_SUSPEND","ADMIN_ACCOUNT_REACTIVATE","ADMIN_SESSION_REVOKE","DATASET_LOCALITY_APPROVE","DATASET_TERM_REJECT"]){const response=(await api(admin,`${BASE}/audit-events?action=${action}&result=success&actorId=${adminUser.id}&limit=10`)).data;expect(response.items.length,action).toBeGreaterThan(0);for(const event of response.items){expect(event.actorId).toBe(adminUser.id);expect(event.action).toBe(action);expect(Object.keys(event).sort()).toEqual(["eventId","actorId","action","result","targetId","requestId","createdAt"].sort());}}
      await api(admin,`${BASE}/audit-events?limit=51`,{expected:400});await api(admin,`${BASE}/review-queue?status=bad`,{expected:400});await api(admin,`${BASE}/localities?q%5B%24ne%5D=x`,{expected:400});await nav("Audit Logs");await page.getByLabel("Action",{exact:true}).fill("ADMIN_REVIEW_ASSIGN");await page.getByLabel("Actor ID").fill(adminUser.id);await page.getByLabel("Result",{exact:true}).selectOption("success");await page.getByRole("button",{name:"Search",exact:true}).click();await expect(page.getByRole("row").filter({hasText:jobId})).toContainText("ADMIN_REVIEW_ASSIGN");
    });
    await step("8/8 Responsive navigation, existing API and logout regression",async()=>{
      await page.setViewportSize({width:390,height:844});const menu=page.getByRole("button",{name:"Open navigation",exact:true});await expect(menu).toBeVisible();await menu.click();await nav("Overview");await expect(page.getByRole("heading",{name:"System Overview",exact:true})).toBeVisible();await expect(menu).toHaveAttribute("aria-expanded","false");await api(admin,`${BASE}/access`);await api(admin,`${BASE}/statistics`);await api(admin,`${BASE}/users?limit=2`);await page.getByRole("button",{name:"Sign out",exact:true}).click();await expect(page).toHaveURL(/\/login\/?$/,{timeout:30000});await api(admin,`${BASE}/audit-events`,{expected:401});
    });
  }catch(e){primaryError=e;throw e;}finally{
    for(const c of contexts)await c.close().catch(()=>{});
    const failures=[];for(const fixture of attempted){try{cli("cleanup-data-manager-browser.js",[fixture.marker]);}catch(e){failures.push(e.message);}}
    if(failures.length){console.error("[CLEANUP FAILED]",failures.join("; "));if(!primaryError)throw new Error(failures.join("; "));}
  }
  console.log("ALL 8 PHASE 10 ADMIN MASTER TEST GROUPS PASSED");
});
