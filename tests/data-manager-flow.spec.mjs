import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

const WEB = "http://localhost:3000";
const API = "http://localhost:5000/api/v1";

const DM = "/p14/data-manager";
const ADMIN = "/p14/admin/dataset-proposals";
const QUEUE = "/p14/reviewer/queue";
const REVIEWS = "/p14/merchant-reviews";

test.use({
  trace: "off",
  screenshot: "off",
  video: "off",
});

test.describe("ThikanaHub Data Manager integration", () => {
  test("Complete secure data management workflow", async ({
    browser,
  }) => {
    test.setTimeout(600000);

    const marker = randomBytes(8).toString("hex");

    const localityId =
      `BD-TEST-BROWSER-${marker.toUpperCase()}`;

    const originalAddress =
      `Synthetic integration address ${marker}, test only`;

    const reviewerNote =
      `Synthetic escalation ${marker}: more investigation required.`;

    const managerNote =
      `Synthetic findings ${marker}: review the test locality reference.`;

    const adminReason =
      `Synthetic browser test decision ${marker}.`;

    const alias =
      `Synthetic Alias ${marker}`;

    const roles = [
      "merchant",
      "reviewer",
      "manager",
      "admin",
    ];

    const accounts = Object.fromEntries(
      roles.map(role => [
        role,
        {
          name: `DM Browser Test ${role}`,
          email: `dm-browser-${role}-${marker}@example.com`,
          password: randomBytes(24).toString("hex"),
        },
      ])
    );

    const names = {
      nameEn: `Synthetic Locality ${marker}`,
      nameBn: `পরীক্ষামূলক এলাকা ${marker}`,
      areaEn: "Synthetic Area",
      areaBn: "পরীক্ষামূলক অঞ্চল",
      districtEn: "Synthetic District",
      districtBn: "পরীক্ষামূলক জেলা",
      divisionEn: "Synthetic Division",
      divisionBn: "পরীক্ষামূলক বিভাগ",
    };

    const labels = {
      nameEn: "Locality name (English)",
      nameBn: "Locality name (বাংলা)",
      areaEn: "Area (English)",
      areaBn: "Area (বাংলা)",
      districtEn: "District (English)",
      districtBn: "District (বাংলা)",
      divisionEn: "Division (English)",
      divisionBn: "Division (বাংলা)",
    };

    const contexts = {};
    const pages = {};

    let passed = 0;
    let primaryError = null;

    let jobId;
    let investigation;
    let handoff;

    let localityProposalId;
    let rejectedProposalId;

    console.log("\nTEST FIXTURE MARKER:", marker);

    async function group(title, action) {
      // Respect the existing production-style
      // Data Manager API rate limit during testing.

      if (passed === 4 || passed === 5) {
        console.log(
          "[TEST PACING] Allowing the 60-second API rate limit window to expire."
        );

        await new Promise(resolve =>
          setTimeout(resolve, 61000)
        );

        console.log(
          "[TEST PACING] Continuing with the next test group."
        );
      }

      await test.step(title, action);

      passed++;

      console.log(
        `\n[PASS ${passed}/8] ${title}\n`
      );
    }

    // ===============================
    // API HELPER
    // ===============================

    async function api(
      context,
      endpoint,
      {
        method = "GET",
        body,
        headers = {},
        expected = 200,
      } = {}
    ) {
      const response = await context.request.fetch(
        API + endpoint,
        {
          method,

          headers: {
            Accept: "application/json",
            Origin: WEB,
            ...headers,
          },

          ...(body === undefined
            ? {}
            : { data: body }),

          timeout: 45000,
          failOnStatusCode: false,
          maxRetries: 0,
        }
      );

      const result = await response.json();

      console.log(
        `[API] ${method} ${endpoint} -> ${response.status()}`
      );

      const allowed = Array.isArray(expected)
        ? expected
        : [expected];

      expect(
        allowed,
        `${endpoint}: ${result.code ?? ""} ${result.message ?? ""}`
      ).toContain(response.status());

      if (response.ok()) {
        expect(result.success).toBe(true);
      }

      return result;
    }

    // ===============================
    // EXISTING DEVELOPMENT CLI
    // ===============================

    async function cli(script, ...args) {
      const result = await execute(
        process.execPath,
        [`scripts/${script}`, ...args],
        {
          cwd: "server",
          timeout: 90000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        }
      );

      if (result.stdout.trim()) {
        console.log(result.stdout.trim());
      }

      return result.stdout;
    }

    async function prepareBrowserFixtures() {
      const passwords = Object.fromEntries(
        roles.map(role => [
          role,
          accounts[role].password,
        ])
      );

      const result = spawnSync(
        process.execPath,

        [
          "scripts/create-data-manager-browser-fixtures.js",
          marker,
        ],

        {
          cwd: "server",

          input: JSON.stringify(passwords),

          encoding: "utf8",

          timeout: 90000,

          windowsHide: true,

          maxBuffer: 1024 * 1024,

          env: {
            ...process.env,
            THIKANAHUB_BROWSER_FIXTURES: "1",
          },
        }
      );

      if (result.error || result.status !== 0) {
        console.error(
          "[FIXTURE PROCESS FAILED]",
          result.error?.code ?? result.status
        );

        throw new Error(
          "Development fixture setup failed. Check the backend fixture script and database connectivity."
        );
      }

      if (result.stdout.trim()) {
        console.log(result.stdout.trim());
      }

      expect(result.stdout).toContain(
        "[SUCCESS] Development test fixtures prepared."
      );
    }

    async function loginPage(role) {
      const page = pages[role];

      await page.goto(`${WEB}/login/`);

      const form = page.locator("form").filter({
        has: page.locator('input[type="email"]'),
      });

      await expect(form).toHaveCount(1);

      await form.locator('input[type="email"]')
        .fill(accounts[role].email);

      await form.locator('input[type="password"]')
        .fill(accounts[role].password);

      await form.locator('button[type="submit"]').click();

      await expect(page).not.toHaveURL(
        /\/login\/?(?:\?.*)?$/,
        { timeout: 30000 }
      );
    }

    async function browserPost(page, suffix, button) {
      const [response] = await Promise.all([
        page.waitForResponse(
          response =>
            new URL(response.url()).pathname.endsWith(suffix) &&
            response.request().method() === "POST",
          { timeout: 45000 }
        ),

        button.click(),
      ]);

      const result = await response.json();

      expect(
        response.ok(),
        `${suffix}: ${result.code ?? ""} ${result.message ?? ""}`
      ).toBe(true);

      expect(result.success).toBe(true);

      return result;
    }

    async function decide(kind, proposalId, action) {
      return api(
        contexts.admin,
        `${ADMIN}/${kind}/${proposalId}/decision`,
        {
          method: "POST",

          body: {
            action,
            reason: adminReason,
          },
        }
      );
    }

    async function findLocality(page, heading) {
      await expect(
        page.getByRole("heading", {
          name: heading,
          exact: true,
        })
      ).toBeVisible();

      await page.getByRole("textbox", {
        name: "Search localities",
      }).fill(localityId);

      await page.getByRole("button", {
        name: "Search",
        exact: true,
      }).click();

      const row = page.getByRole("row").filter({
        hasText: localityId,
      });

      await expect(row).toBeVisible({
        timeout: 30000,
      });

      return row;
    }

    async function fillEvidence(page, reasonLabel) {
      await page.getByLabel(reasonLabel, {
        exact: true,
      }).fill("Synthetic browser integration test only.");

      await page.getByLabel("Supporting evidence", {
        exact: true,
      }).fill("Synthetic test evidence. Not real geographic data.");
    }

    try {
      // Four isolated cookie stores.

      for (const role of roles) {
        contexts[role] = await browser.newContext({
          viewport: {
            width: 1440,
            height: 900,
          },
        });

        pages[role] = await contexts[role].newPage();
        pages[role].setDefaultTimeout(25000);

        pages[role].on("response", response => {
          const url = new URL(response.url());

          if (
            !url.pathname.startsWith("/api/v1/")
          ) {
            return;
          }

          if (
            role === "manager" ||
            response.status() >= 400
          ) {
            const headers = response.headers();

            console.log(
              "[BROWSER API]",
              role,
              response.request().method(),
              url.pathname,
              "->",
              response.status(),
              "| Remaining:",
              headers["ratelimit-remaining"] ?? "N/A",
              "| Reset:",
              headers["ratelimit-reset"] ?? "N/A"
            );
          }

          if (response.status() === 429) {
            console.error(
              "[BROWSER RATE LIMIT]",
              role,
              url.pathname,
              "Retry-After:",
              response.headers()["retry-after"] ?? "N/A"
            );
          }
        });

        // Only dedicated synthetic test accounts
        // are used in this suite.

        pages[role].on("dialog", dialog => {
          void dialog.accept();
        });
      }

      const merchant = pages.merchant;
      const reviewer = pages.reviewer;
      const manager = pages.manager;

      // ===============================
      // GROUP 01 — AUTHENTICATION
      // ===============================

      await group(
        "Authentication, role isolation and dashboard redirect",
        async () => {
          await api(contexts.manager, "/health");

          await api(
            contexts.manager,
            `${DM}/dashboard`,
            { expected: 401 }
          );

          // Development-only synthetic test fixtures.
          // Public registration security remains unchanged.

          await prepareBrowserFixtures();

          await cli(
            "reviewer-admin.js",
            "provision",
            accounts.reviewer.email
          );

          await cli(
            "data-manager-admin.js",
            "provision",
            accounts.manager.email
          );

          await cli(
            "admin-provision.js",
            "provision",
            accounts.admin.email
          );

          for (const role of roles) {
            await contexts[role].clearCookies();
          }

          await loginPage("merchant");
          await loginPage("reviewer");
          await loginPage("manager");

          await api(
            contexts.admin,
            "/auth/login",
            {
              method: "POST",

              body: {
                email: accounts.admin.email,
                password: accounts.admin.password,
              },
            }
          );

          await expect(manager).toHaveURL(
            /\/dashboard\/data-manager\/?$/,
            { timeout: 30000 }
          );

          await api(
            contexts.merchant,
            `${DM}/dashboard`,
            { expected: 403 }
          );

          await api(
            contexts.reviewer,
            `${DM}/dashboard`,
            { expected: 403 }
          );

          await api(
            contexts.manager,
            `${ADMIN}/locality`,
            { expected: 403 }
          );

          await merchant.goto(
            `${WEB}/dashboard/data-manager/`
          );

          await expect(merchant).toHaveURL(
            /\/dashboard\/?$/,
            { timeout: 30000 }
          );
        }
      );

      // ===============================
      // GROUP 02 — LIVE DASHBOARD
      // ===============================

      await group(
        "Live dashboard and responsive navigation",
        async () => {
          await expect(
            manager.getByRole("heading", {
              name: "Data Manager Dashboard",
              exact: true,
            })
          ).toBeVisible();

          const result = await api(
            contexts.manager,
            `${DM}/dashboard`
          );

          expect(result.summary.proposals.total).toBe(0);

          const approvedCard = manager
            .locator("article")
            .filter({
              hasText: "Approved localities",
            });

          await expect(
            approvedCard.getByText(
              new Intl.NumberFormat("en-BD").format(
                result.summary.approvedLocalities
              ),
              { exact: true }
            )
          ).toBeVisible();

          await expect(
            manager.getByText("No proposals yet", {
              exact: true,
            })
          ).toBeVisible();

          await manager.getByRole("button", {
            name: "Refresh",
            exact: true,
          }).click();

          await expect(
            manager.getByRole("button", {
              name: "Refresh",
              exact: true,
            })
          ).toBeEnabled();

          const nav = manager.getByRole("navigation", {
            name: "Data Manager navigation",
          });

          for (const link of [
            "Overview",
            "Localities",
            "Landmarks & Aliases",
            "My Proposals",
            "Escalations",
            "Decision History",
          ]) {
            await expect(
              nav.getByRole("link", {
                name: link,
                exact: true,
              })
            ).toBeVisible();
          }

          await manager.setViewportSize({
            width: 390,
            height: 844,
          });

          await manager.getByRole("button", {
            name: "Open navigation",
          }).click();

          await expect(
            nav.getByRole("link", {
              name: "Localities",
              exact: true,
            })
          ).toBeVisible();

          await manager.getByRole("button", {
            name: "Close menu",
            exact: true,
          }).click();

          await expect(
            manager.getByRole("button", {
              name: "Open navigation",
            })
          ).toHaveAttribute("aria-expanded", "false");

          await manager.setViewportSize({
            width: 1440,
            height: 900,
          });
        }
      );

      // ===============================
      // GROUP 03 — LOCALITY CREATE
      // ===============================

      await group(
        "Bilingual locality proposal and Admin publication",
        async () => {
          await manager.getByRole("link", {
            name: "Localities",
            exact: true,
          }).click();

          await manager.getByRole("button", {
            name: "New locality proposal",
            exact: true,
          }).click();

          await manager.getByLabel("Locality ID", {
            exact: true,
          }).fill(localityId);

          for (const [key, label] of Object.entries(labels)) {
            await manager.getByLabel(label, {
              exact: true,
            }).fill(names[key]);
          }

          await fillEvidence(
            manager,
            "Reason for change"
          );

          const created = await browserPost(
            manager,
            `${DM}/locality-proposals`,
            manager.getByRole("button", {
              name: "Submit proposal",
              exact: true,
            })
          );

          localityProposalId =
            created.item.proposalId;

          expect(created.item.status).toBe("pending");

          // Pending proposal must not modify live data.

          await api(
            contexts.manager,
            `${DM}/localities/${localityId}`,
            { expected: 404 }
          );

          await expect(
            manager.getByRole("status").filter({
              hasText: "submitted successfully",
            })
          ).toBeVisible();

          const decision = await decide(
            "locality",
            localityProposalId,
            "approve"
          );

          expect(decision.item.status).toBe("approved");
          expect(decision.item.decision.published).toBe(true);

          const row = await findLocality(
            manager,
            "Locality Management"
          );

          await expect(row).toContainText(names.nameEn);
          await expect(row).toContainText(names.nameBn);

          const published = await api(
            contexts.manager,
            `${DM}/localities/${localityId}`
          );

          expect(published.item.approved).toBe(true);

          expect(published.item.locality.nameEn)
            .toBe(names.nameEn);
        }
      );

      // ===============================
      // GROUP 04 — LOCALITY UPDATE
      // ===============================

      await group(
        "Existing locality update and pending-state protection",
        async () => {
          const row = await findLocality(
            manager,
            "Locality Management"
          );

          await row.getByRole("button", {
            name: "Propose edit",
            exact: true,
          }).click();

          const field = manager.getByLabel(
            labels.nameEn,
            { exact: true }
          );

          await expect(field).toHaveValue(names.nameEn);

          const newName =
            `Updated Synthetic Locality ${marker}`;

          await field.fill(newName);

          await fillEvidence(
            manager,
            "Reason for change"
          );

          const proposal = await browserPost(
            manager,
            `${DM}/locality-proposals`,
            manager.getByRole("button", {
              name: "Submit proposal",
              exact: true,
            })
          );

          expect(proposal.item.status).toBe("pending");

          const before = await api(
            contexts.manager,
            `${DM}/localities/${localityId}`
          );

          expect(before.item.locality.nameEn)
            .toBe(names.nameEn);

          await decide(
            "locality",
            proposal.item.proposalId,
            "approve"
          );

          const updated = await findLocality(
            manager,
            "Locality Management"
          );

          await expect(updated).toContainText(newName);
        }
      );

      // ===============================
      // GROUP 05 — TERM & HISTORY
      // ===============================

      await group(
        "Alias proposals, rejection and decision history",
        async () => {
          await manager.getByRole("link", {
            name: "Landmarks & Aliases",
            exact: true,
          }).click();

          let row = await findLocality(
            manager,
            "Landmarks & Aliases"
          );

          await row.getByRole("button", {
            name: "Manage terms",
          }).click();

          await manager.getByLabel("Dataset field", {
            exact: true,
          }).selectOption("aliases");

          await manager.getByLabel("New term", {
            exact: true,
          }).fill(alias);

          await fillEvidence(manager, "Reason");

          const proposal = await browserPost(
            manager,
            `${DM}/term-proposals`,
            manager.getByRole("button", {
              name: "Submit proposal",
              exact: true,
            })
          );

          expect(proposal.item.status).toBe("pending");

          await decide(
            "term",
            proposal.item.proposalId,
            "approve"
          );

          row = await findLocality(
            manager,
            "Landmarks & Aliases"
          );

          await row.getByRole("button", {
            name: "Manage terms",
          }).click();

          await expect(
            manager.getByText(alias, {
              exact: true,
            })
          ).toBeVisible();

          await manager.getByLabel("Operation", {
            exact: true,
          }).selectOption("remove");

          await manager.getByLabel("Existing term", {
            exact: true,
          }).selectOption(alias);

          await fillEvidence(manager, "Reason");

          const removal = await browserPost(
            manager,
            `${DM}/term-proposals`,
            manager.getByRole("button", {
              name: "Submit proposal",
              exact: true,
            })
          );

          rejectedProposalId = removal.item.proposalId;

          const rejected = await decide(
            "term",
            rejectedProposalId,
            "reject"
          );

          expect(rejected.item.status).toBe("rejected");
          expect(rejected.item.decision.published).toBe(false);

          const terms = await api(
            contexts.manager,
            `${DM}/localities/${localityId}/terms`
          );

          const aliases = terms.fields.find(
            item => item.field === "aliases"
          );

          // Rejected removal must leave live terms unchanged.

          expect(aliases.items).toContain(alias);

          await manager.getByRole("link", {
            name: "My Proposals",
            exact: true,
          }).click();

          await expect(
            manager.getByRole("heading", {
              name: "My Proposals",
              exact: true,
            })
          ).toBeVisible();

          await manager.getByRole("button", {
            name: "Landmark & alias proposals",
            exact: true,
          }).click();

          const rejectedRow = manager.getByRole("row")
            .filter({ hasText: rejectedProposalId });

          await expect(rejectedRow)
            .toContainText(/rejected/i);

          await manager.getByRole("link", {
            name: "Decision History",
            exact: true,
          }).click();

          await expect(
            manager.getByRole("heading", {
              name: "Decision History",
              exact: true,
            })
          ).toBeVisible({ timeout: 30000 });

          try {
            const [historyResponse] = await Promise.all([
              manager.waitForResponse(
                response =>
                  response.request().method() === "GET" &&
                  new URL(response.url()).pathname ===
                    "/api/v1" + DM + "/term-proposals",
                { timeout: 45000 }
              ),

              manager.getByRole("button", {
                name: "Landmark & alias proposals",
                exact: true,
              }).click(),
            ]);

            const historyBody =
              await historyResponse.json();

            console.log(
              "[HISTORY LIST RESPONSE]",
              historyResponse.status()
            );

            console.log(
              "[HISTORY LIST DIAGNOSTICS]",
              JSON.stringify({
                success: historyBody.success,
                code: historyBody.code ?? null,
                itemCount: historyBody.items?.length ?? 0,
                retryAfter:
                  historyResponse.headers()["retry-after"] ??
                  null,
              })
            );

            expect(
              historyResponse.status(),
              "Decision History API request failed"
            ).toBe(200);

            expect(historyBody.success).toBe(true);

            const storedProposal =
              historyBody.items.find(
                item =>
                  item.proposalId === rejectedProposalId
              );

            expect(
              storedProposal,
              "Rejected proposal missing from history response"
            ).toBeDefined();

            expect(
              storedProposal.status
            ).toBe("rejected");

            console.log(
              "[HISTORY LIST VERIFIED] Rejected proposal exists in API response."
            );

          } catch (error) {
            console.error(
              "[HISTORY UI ALERTS]",
              await manager.getByRole("alert").allTextContents()
            );

            throw error;
          }

          const historyRow = manager.getByRole("row")
            .filter({ hasText: rejectedProposalId });

          await expect(historyRow)
            .toContainText(
              /rejected/i,
              { timeout: 30000 }
            );

          console.log(
            "[PASS] Rejected proposal visible in Decision History."
          );

          // Verify the actual browser response before
          // checking the administrative decision UI.

          const detailPath =
            DM + "/dataset-proposals/term/" +
            rejectedProposalId;

          try {
            const [detailResponse] = await Promise.all([
              manager.waitForResponse(
                response =>
                  response.request().method() === "GET" &&
                  new URL(response.url()).pathname ===
                    "/api/v1" + detailPath,
                { timeout: 45000 }
              ),

              historyRow.getByRole("button", {
                name: "View",
                exact: true,
              }).click(),
            ]);

            const detailBody = await detailResponse
              .json()
              .catch(() => null);

            console.log(
              "[DECISION DETAIL RESPONSE]",
              detailResponse.status()
            );

            console.log(
              "[DECISION DETAIL DIAGNOSTICS]",
              JSON.stringify({
                success: detailBody?.success ?? false,
                code: detailBody?.code ?? null,
                hasItem: Boolean(detailBody?.item),
                status: detailBody?.item?.status ?? null,
                hasDecision: Boolean(
                  detailBody?.item?.decision
                ),
                reasonMatches:
                  detailBody?.item?.decision?.reason ===
                    adminReason,
                retryAfter:
                  detailResponse.headers()["retry-after"] ??
                    null,
                rateLimitReset:
                  detailResponse.headers()["ratelimit-reset"] ??
                    null,
              })
            );

            expect(
              detailResponse.status(),
              "Decision detail API failed"
            ).toBe(200);

            expect(detailBody?.success).toBe(true);

            expect(
              detailBody?.item?.proposalId
            ).toBe(rejectedProposalId);

            expect(
              detailBody?.item?.status
            ).toBe("rejected");

            expect(
              detailBody?.item?.decision?.reason
            ).toBe(adminReason);

            expect(
              detailBody?.item?.decision?.published
            ).toBe(false);

            console.log(
              "[PASS] Decision detail API contract verified."
            );

            await expect(
              manager.getByRole("heading", {
                name: "Proposal details",
                exact: true,
              })
            ).toBeVisible({ timeout: 30000 });

            await expect(
              manager.getByText(adminReason, {
                exact: true,
              })
            ).toBeVisible({ timeout: 30000 });

            console.log(
              "[PASS] Administrative decision reason displayed."
            );

          } catch (error) {
            console.error(
              "[DECISION UI ALERTS]",
              await manager.getByRole("alert").allTextContents()
            );

            throw error;
          }

          await expect(
            manager.getByText(
              "This decision did not publish changes.",
              { exact: true }
            )
          ).toBeVisible();
        }
      );

      // ===============================
      // GROUP 06 — ESCALATION FIXTURE
      // ===============================

      await group(
        "Merchant request and Reviewer escalation",
        async () => {
          const created = await api(
            contexts.merchant,
            "/p14/address-resolutions",
            {
              method: "POST",
              expected: 201,

              body: {
                address: originalAddress,
              },
            }
          );

          jobId = created.jobId;

          expect(jobId).toMatch(/^[a-f0-9]{24}$/i);

          await api(
            contexts.merchant,
            "/p14/address-feedback",
            {
              method: "POST",

              body: {
                jobId,
                decision: "no_correct_match",
                revision: 0,
              },
            }
          );

          await cli(
            "reviewer-admin.js",
            "assign",
            jobId,
            accounts.reviewer.email
          );

          const detail = await api(
            contexts.reviewer,
            `${QUEUE}/${jobId}`
          );

          await api(
            contexts.reviewer,
            `${QUEUE}/${jobId}/decision`,
            {
              method: "POST",

              headers: {
                "X-Review-Assignment": detail.assignedAt,
              },

              body: {
                decision: "escalated",
                revision: detail.revision,
                note: reviewerNote,
              },
            }
          );

          await manager.getByRole("link", {
            name: "Escalations",
            exact: true,
          }).click();

          await expect(
            manager.getByRole("heading", {
              name: "Escalation Management",
            })
          ).toBeVisible();

          await manager.getByRole("textbox", {
            name: "Search by request ID",
          }).fill("invalid");

          await manager.getByRole("button", {
            name: "Search",
            exact: true,
          }).click();

          await expect(
            manager.getByText(
              "Enter a valid 24-character request ID.",
              { exact: true }
            )
          ).toBeVisible();

          await manager.getByRole("textbox", {
            name: "Search by request ID",
          }).fill(jobId);

          await manager.getByRole("button", {
            name: "Search",
            exact: true,
          }).click();

          const row = manager.getByRole("row")
            .filter({ hasText: jobId });

          await expect(row).toBeVisible();

          await expect(
            row.getByText(originalAddress, {
              exact: true,
            })
          ).toHaveCount(0);

          await api(
            contexts.merchant,
            `${DM}/escalations/${jobId}/investigation`,
            { expected: 403 }
          );
        }
      );

      // ===============================
      // GROUP 07 — SECURE HANDOFF
      // ===============================

      await group(
        "Secure investigation, handoff and Reviewer context",
        async () => {
          const row = manager.getByRole("row")
            .filter({ hasText: jobId });

          const [response] = await Promise.all([
            manager.waitForResponse(
              response =>
                response.request().method() === "GET" &&
                new URL(response.url()).pathname.endsWith(
                  `/escalations/${jobId}/investigation`
                ),
              { timeout: 45000 }
            ),

            row.getByRole("button", {
              name: "Investigate",
            }).click(),
          ]);

          expect(response.status()).toBe(200);

          expect(response.headers()["cache-control"])
            .toBe("no-store");

          investigation = (await response.json()).item;

          await expect(
            manager.getByText(originalAddress, {
              exact: true,
            })
          ).toBeVisible();

          await expect(
            manager.getByText(reviewerNote, {
              exact: true,
            })
          ).toBeVisible();

          const handoffButton = manager.getByRole(
            "button",
            {
              name: "Return to reviewer",
              exact: true,
            }
          );

          await expect(handoffButton).toBeDisabled();

          await manager.getByLabel(
            "Investigation findings",
            { exact: true }
          ).fill(managerNote);

          await expect(handoffButton).toBeDisabled();

          await manager.getByRole("checkbox", {
            name: /I have reviewed these findings/,
          }).check();

          await expect(handoffButton).toBeEnabled();

          handoff = await browserPost(
            manager,
            `/escalations/${jobId}/handoff`,
            handoffButton
          );

          expect(handoff.reviewStatus).toBe("pending");

          await expect(
            manager.getByRole("row").filter({
              hasText: jobId,
            })
          ).toHaveCount(0);

          // A repeated stale handoff cannot mutate
          // the new reviewer assignment.

          await api(
            contexts.manager,
            `${DM}/escalations/${jobId}/handoff`,
            {
              method: "POST",

              expected: [404, 409],

              body: {
                revision: investigation.revision,
                version: investigation.version,
                note: managerNote,
              },
            }
          );

          await reviewer.goto(
            `${WEB}/dashboard/reviewer/`
          );

          await reviewer.getByRole("button", {
            name: "Open Review",
            exact: true,
          }).click();

          const detailRegion = reviewer.getByRole(
            "region",
            { name: "Manual review details" }
          );

          await expect(detailRegion).toBeVisible();

          await expect(
            detailRegion.getByText(
              "Investigation findings",
              { exact: true }
            )
          ).toBeVisible();

          await expect(
            detailRegion.getByText(managerNote, {
              exact: true,
            })
          ).toBeVisible();

          const context = await api(
            contexts.reviewer,
            `${QUEUE}/${jobId}/handoff-context`
          );

          expect(context.context.note).toBe(managerNote);

          expect(context.context.assignedAt)
            .toBe(handoff.assignedAt);

          const detail = await api(
            contexts.reviewer,
            `${QUEUE}/${jobId}`
          );

          // Reviewer findings are verified in browser.
          // The final recommendation uses the existing
          // verified decision API.

          await api(
            contexts.reviewer,
            `${QUEUE}/${jobId}/decision`,
            {
              method: "POST",

              headers: {
                "X-Review-Assignment": detail.assignedAt,
              },

              body: {
                decision: "resolved",
                localityId,
                revision: detail.revision,
                note: "Synthetic test recommendation.",
              },
            }
          );
        }
      );

      // ===============================
      // GROUP 08 — MERCHANT & LOGOUT
      // ===============================

      await group(
        "Merchant acceptance, private-note isolation and logout",
        async () => {
          const result = await api(
            contexts.merchant,
            `${REVIEWS}/${jobId}`
          );

          expect(result.reviewStatus).toBe("resolved");
          expect(result.canAccept).toBe(true);

          expect(JSON.stringify(result))
            .not.toContain(managerNote);

          await api(
            contexts.merchant,
            `${QUEUE}/${jobId}/handoff-context`,
            { expected: 403 }
          );

          await merchant.goto(
            `${WEB}/dashboard/reviews/`
          );

          await merchant.getByRole("button", {
            name: "View Review Result",
            exact: true,
          }).click();

          const reviewRegion = merchant.getByRole(
            "region",
            { name: "Merchant review result" }
          );

          await expect(reviewRegion).toBeVisible();

          await expect(
            merchant.getByText(managerNote, {
              exact: true,
            })
          ).toHaveCount(0);

          await browserPost(
            merchant,
            `${REVIEWS}/${jobId}/decision`,
            reviewRegion.getByRole("button", {
              name: "Accept Recommendation",
              exact: true,
            })
          );

          const accepted = await api(
            contexts.merchant,
            `${REVIEWS}/${jobId}`
          );

          expect(accepted.reviewStatus).toBe("accepted");
          expect(accepted.addressStatus).toBe("confirmed");
          expect(accepted.canAccept).toBe(false);

          await manager.getByRole("button", {
            name: "Sign out",
            exact: true,
          }).click();

          await expect(manager).toHaveURL(
            /\/login\/?$/,
            { timeout: 30000 }
          );

          await manager.goto(
            `${WEB}/dashboard/data-manager/escalations/`
          );

          await expect(manager).toHaveURL(
            /\/login\/?$/,
            { timeout: 30000 }
          );

          await api(
            contexts.manager,
            `${DM}/dashboard`,
            { expected: 401 }
          );
        }
      );

    } catch (error) {
      primaryError = error;

      console.error(
        `[FAILED] Completed groups: ${passed}/8`
      );

      throw error;

    } finally {
      await Promise.allSettled(
        Object.values(contexts).map(
          context => context.close()
        )
      );

      try {
        await cli(
          "cleanup-data-manager-browser.js",
          marker
        );

      } catch (cleanupError) {
        console.error(
          "[CLEANUP FAILED] Fixture marker:",
          marker
        );

        console.error(cleanupError.message);

        if (!primaryError) {
          throw cleanupError;
        }
      }
    }

    expect(passed).toBe(8);

    console.log("\n================================");
    console.log("FINAL DATA MANAGER BROWSER RESULT");
    console.log("Total Test Groups: 8");
    console.log("Passed:", passed);
    console.log("Failed: 0");
    console.log("ALL 8 BROWSER TEST GROUPS PASSED");
    console.log("================================\n");
  });
});
