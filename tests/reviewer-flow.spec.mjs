import { test, expect } from "@playwright/test";

import assert from "node:assert/strict";

import {
  randomBytes,
} from "node:crypto";

import {
  execFileSync,
} from "node:child_process";

import {
  fileURLToPath,
} from "node:url";

// =====================================
// TEST CONFIGURATION
// =====================================

const WEB = "http://localhost:3000";

const API =
  "http://localhost:5000/api/v1";

const SERVER_DIR = fileURLToPath(
  new URL("../server/", import.meta.url)
);

const STATS =
  "/p14/reviewer/statistics";

const QUEUE =
  "/p14/reviewer/queue";

const REVIEWS =
  "/p14/merchant-reviews";

const LOCALITY_ID =
  "BD-DHA-MIR-KAZIPARA";

const ui = expect.configure({
  timeout: 30000,
});

test.use({
  headless: true,

  channel:
    process.env.THIKANAHUB_BROWSER === "chromium"
      ? undefined
      : "chrome",
});

// =====================================
// API REQUEST HELPER
// =====================================

async function api(
  context,
  endpoint,
  {
    method = "GET",
    body,
    headers = {},
    status = 200,
  } = {}
) {
  const response =
    await context.request.fetch(
      `${API}${endpoint}`,
      {
        method,

        headers: {
          Origin: WEB,

          Accept: "application/json",

          ...headers,
        },

        ...(body !== undefined
          ? { data: body }
          : {}),

        timeout: 45000,
      }
    );

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(
      `${method} ${endpoint}: Invalid JSON response`
    );
  }

  console.log(
    `[API] ${method} ${endpoint} -> ${response.status()}`
  );

  assert.equal(
    response.status(),
    status,

    `${method} ${endpoint}: ${
      result.code ?? ""
    } ${result.message ?? ""}`
  );

  if (status >= 200 && status < 300) {
    assert.equal(result.success, true);
  }

  return result;
}

// =====================================
// BACKEND CLI HELPER
// =====================================

function runBackendScript(
  script,
  args
) {
  try {
    const output = execFileSync(
      process.execPath,

      [script, ...args],

      {
        cwd: SERVER_DIR,

        encoding: "utf8",

        timeout: 60000,

        windowsHide: true,

        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      }
    );

    console.log(output.trim());

  } catch (error) {
    if (error.stdout) {
      console.log(
        String(error.stdout).trim()
      );
    }

    if (error.stderr) {
      console.error(
        String(error.stderr).trim()
      );
    }

    throw new Error(
      `Backend script failed: ${script}`
    );
  }
}

function provision(email) {
  runBackendScript(
    "scripts/reviewer-admin.js",

    [
      "provision",
      email,
    ]
  );
}

function assign(jobId, email) {
  runBackendScript(
    "scripts/reviewer-admin.js",

    [
      "assign",
      jobId,
      email,
    ]
  );
}

// =====================================
// ACCOUNT HELPERS
// =====================================

function createAccountData(label, marker) {
  return {
    name: `Integration Test ${label}`,

    email:
      `e2e-${label.toLowerCase()}-${marker}@example.com`,

    password:
      randomBytes(24).toString("hex"),
  };
}

async function register(context, account) {
  await api(
    context,
    "/auth/register",
    {
      method: "POST",

      status: 201,

      body: account,
    }
  );
}

async function login(context, account) {
  await api(
    context,
    "/auth/login",
    {
      method: "POST",

      body: {
        email: account.email,
        password: account.password,
      },
    }
  );
}

// =====================================
// CREATE MANUAL REVIEW REQUEST
// =====================================

async function requestReview(
  context,
  address
) {
  const created = await api(
    context,

    "/p14/address-resolutions",

    {
      method: "POST",

      status: 201,

      body: { address },
    }
  );

  assert.match(
    created.jobId,
    /^[a-f0-9]{24}$/i
  );

  await api(
    context,

    "/p14/address-feedback",

    {
      method: "POST",

      body: {
        jobId: created.jobId,

        decision: "no_correct_match",

        revision: 0,
      },
    }
  );

  return created.jobId;
}

// =====================================
// BROWSER HELPERS
// =====================================

function reviewerPanel(page) {
  return page.getByRole(
    "region",

    {
      name: "Manual review details",
    }
  );
}

function merchantPanel(page) {
  return page.getByRole(
    "region",

    {
      name: "Merchant review result",
    }
  );
}

async function openReviewerJob(
  page,
  jobId
) {
  await page.goto(
    `${WEB}/dashboard/reviewer/`
  );

  const card = page
    .locator("article")
    .filter({
      hasText: jobId,
    });

  const button = card.getByRole(
    "button",

    {
      name: "Open Review",

      exact: true,
    }
  );

  await ui(button).toBeVisible();

  await button.click();

  const panel = reviewerPanel(page);

  await ui(
    panel.getByLabel("Reviewer Reason")
  ).toBeVisible();

  return panel;
}

async function openMerchantJob(
  page,
  jobId
) {
  await page.goto(
    `${WEB}/dashboard/reviews/`
  );

  const card = page
    .locator("article")
    .filter({
      hasText: jobId,
    });

  const button = card.getByRole(
    "button",

    {
      name: "View Review Result",

      exact: true,
    }
  );

  await ui(button).toBeVisible();

  await button.click();

  const panel = merchantPanel(page);

  await ui(
    panel.getByText(
      "Original Address",

      { exact: true }
    )
  ).toBeVisible();

  return panel;
}

// =====================================
// VERIFY REAL BROWSER MUTATION
// =====================================

async function clickMutation(
  page,
  button,
  endpoint,
  method = "POST"
) {
  await ui(button).toBeEnabled();

  const [
    response,
  ] = await Promise.all([

    page.waitForResponse(
      (response) =>
        new URL(response.url())
          .pathname
          .endsWith(endpoint) &&

        response.request().method() === method,

      { timeout: 45000 }
    ),

    button.click(),
  ]);

  const result = await response.json();

  assert.equal(
    response.status(),
    200,

    `${endpoint}: ${
      result.code ?? ""
    } ${result.message ?? ""}`
  );

  assert.equal(result.success, true);

  return result;
}

// =====================================
// COMPLETE REVIEW INTEGRATION
// =====================================

test(
  "ThikanaHub Merchant and Reviewer end-to-end flow",

  async ({ browser }) => {
    test.setTimeout(420000);

    let passed = 0;

    const marker =
      randomBytes(8).toString("hex");

    const merchantAccount =
      createAccountData(
        "Merchant",
        marker
      );

    const reviewerAccount =
      createAccountData(
        "Reviewer",
        marker
      );

    const acceptedAddress =
      `Synthetic ${marker} Test A, Kazipara, Mirpur, Dhaka`;

    const escalatedAddress =
      `Synthetic ${marker} Test B, Unknown locality`;

    const firstNote =
      `Synthetic ${marker}: Initial locality recommendation.`;

    const finalNote =
      `Synthetic ${marker}: Reviewed again and recommended Kazipara.`;

    const escalationNote =
      `Synthetic ${marker}: Insufficient locality evidence. Further investigation required.`;

    let acceptedJobId;
    let escalatedJobId;

    let firstAssignment;
    let firstReviewVersion;

    let approvedLocality;

    const merchant =
      await browser.newContext();

    const reviewer =
      await browser.newContext();

    const merchantPage =
      await merchant.newPage();

    const reviewerPage =
      await reviewer.newPage();

    // All confirmation dialogs below
    // belong to synthetic test actions.

    for (const page of [
      merchantPage,
      reviewerPage,
    ]) {
      page.setDefaultTimeout(30000);

      page.on(
        "dialog",

        async (dialog) => {
          await dialog.accept();
        }
      );
    }

    async function group(
      title,
      action
    ) {
      await test.step(title, action);

      passed++;

      console.log(
        `\n[PASS ${passed}/11] ${title}\n`
      );
    }

    console.log(
      "\n================================"
    );

    console.log(
      "THIKANAHUB REVIEWER INTEGRATION TEST"
    );

    console.log(
      "================================\n"
    );

    try {
      // =================================
      // TEST GROUP 01
      // =================================

      await group(
        "Server health, account setup and authentication",

        async () => {
          await api(
            merchant,

            "/health"
          );

          // Check frontend availability
          // before creating accounts.

          const homepage =
            await merchantPage.goto(WEB);

          assert.ok(
            homepage?.ok(),
            "Frontend is unavailable"
          );

          await api(
            reviewer,

            STATS,

            { status: 401 }
          );

          await register(
            merchant,

            merchantAccount
          );

          await register(
            reviewer,

            reviewerAccount
          );

          provision(
            reviewerAccount.email
          );

          await login(
            merchant,

            merchantAccount
          );

          await login(
            reviewer,

            reviewerAccount
          );

          const stats = await api(
            reviewer,

            STATS
          );

          assert.deepEqual(
            stats.summary,

            {
              pending: 0,
              resolved: 0,
              escalated: 0,
              merchantAccepted: 0,
            }
          );
        }
      );

      // =================================
      // TEST GROUP 02
      // =================================

      await group(
        "Role isolation and dashboard access",

        async () => {
          await api(
            merchant,

            STATS,

            { status: 403 }
          );

          await api(
            merchant,

            QUEUE,

            { status: 403 }
          );

          await api(
            reviewer,

            "/p14/address-history",

            { status: 403 }
          );

          await merchantPage.goto(
            `${WEB}/dashboard/reviewer/`
          );

          await ui(
            merchantPage.getByRole(
              "heading",

              { name: "Access restricted" }
            )
          ).toBeVisible();

          await reviewerPage.goto(
            `${WEB}/dashboard/reviews/`
          );

          await ui(
            reviewerPage.getByRole(
              "heading",

              { name: "Access restricted" }
            )
          ).toBeVisible();

          await reviewerPage.goto(
            `${WEB}/dashboard/`
          );

          await ui(reviewerPage).toHaveURL(
            /\/dashboard\/reviewer\/?$/
          );

          await ui(
            reviewerPage.getByRole(
              "heading",

              {
                name: "Reviewer Dashboard",

                exact: true,
              }
            )
          ).toBeVisible();
        }
      );

      // =================================
      // TEST GROUP 03
      // =================================

      await group(
        "Create and assign two manual review requests",

        async () => {
          acceptedJobId =
            await requestReview(
              merchant,

              acceptedAddress
            );

          escalatedJobId =
            await requestReview(
              merchant,

              escalatedAddress
            );

          const unassigned = await api(
            merchant,

            `${REVIEWS}/${acceptedJobId}`
          );

          assert.equal(
            unassigned.reviewStatus,
            "unassigned"
          );

          // Unassigned reviewer access
          // must be denied.

          await api(
            reviewer,

            `${QUEUE}/${acceptedJobId}`,

            { status: 404 }
          );

          assign(
            acceptedJobId,

            reviewerAccount.email
          );

          assign(
            escalatedJobId,

            reviewerAccount.email
          );

          const pending = await api(
            reviewer,

            STATS
          );

          assert.equal(
            pending.summary.pending,
            2
          );

          const detail = await api(
            reviewer,

            `${QUEUE}/${acceptedJobId}`
          );

          firstAssignment =
            detail.assignedAt;

          const localities = await api(
            reviewer,

            `${QUEUE}/${acceptedJobId}/localities`
          );

          approvedLocality =
            localities.items.find(
              (item) =>
                item.localityId === LOCALITY_ID
            );

          assert.ok(
            approvedLocality,

            "Approved Kazipara test locality missing"
          );

          await api(
            reviewer,

            `${REVIEWS}/${acceptedJobId}`,

            { status: 403 }
          );
        }
      );

      // =================================
      // TEST GROUP 04
      // =================================

      await group(
        "Bilingual search and reviewer recommendation",

        async () => {
          const panel =
            await openReviewerJob(
              reviewerPage,

              acceptedJobId
            );

          const search =
            panel.getByLabel(
              "Search Approved Localities"
            );

          const radio = panel.locator(
            `input[name="review-locality"][value="${LOCALITY_ID}"]`
          );

          // English search

          await search.fill(
            approvedLocality.locality.nameEn
          );

          await ui(radio).toBeVisible();

          // Bangla search

          assert.ok(
            approvedLocality.locality.nameBn,

            "Bangla locality name missing"
          );

          await search.fill(
            approvedLocality.locality.nameBn
          );

          await ui(radio).toBeVisible();

          // Empty search result

          await search.fill(
            "zzq-no-matching-locality-zzq"
          );

          await ui(
            panel.getByText(
              "No matching approved locality found.",

              { exact: true }
            )
          ).toBeVisible();

          await ui(radio).toHaveCount(0);

          await search.fill(
            approvedLocality.locality.nameEn
          );

          await radio.check();

          const submit =
            panel.getByRole(
              "button",

              {
                name: "Submit Recommendation",

                exact: true,
              }
            );

          // Cannot submit without reason.

          await ui(submit).toBeDisabled();

          await panel
            .getByLabel("Reviewer Reason")
            .fill("abc");

          await ui(submit).toBeDisabled();

          await panel
            .getByLabel("Reviewer Reason")
            .fill(firstNote);

          const result =
            await clickMutation(
              reviewerPage,

              submit,

              `${QUEUE}/${acceptedJobId}/decision`
            );

          assert.equal(
            result.reviewStatus,
            "resolved"
          );

          const review = await api(
            merchant,

            `${REVIEWS}/${acceptedJobId}`
          );

          assert.equal(
            review.reviewStatus,
            "resolved"
          );

          assert.equal(
            review.canAccept,
            true
          );

          assert.equal(
            review.outcome.note,
            firstNote
          );

          firstReviewVersion =
            review.reviewVersion;

          assert.match(
            firstReviewVersion,
            /^[a-f0-9]{64}$/i
          );
        }
      );

      // =================================
      // TEST GROUP 05
      // =================================

      await group(
        "Merchant result display and re-review",

        async () => {
          const panel =
            await openMerchantJob(
              merchantPage,

              acceptedJobId
            );

          await ui(
            panel.getByText(
              "Recommendation Available",

              { exact: true }
            )
          ).toBeVisible();

          await ui(
            panel.getByText(
              firstNote,

              { exact: true }
            )
          ).toBeVisible();

          await ui(
            panel.getByText(
              "Manual Human Review — Not AI-scored",

              { exact: true }
            )
          ).toBeVisible();

          const result =
            await clickMutation(
              merchantPage,

              panel.getByRole(
                "button",

                {
                  name: "Request Re-review",

                  exact: true,
                }
              ),

              `${REVIEWS}/${acceptedJobId}/decision`
            );

          assert.equal(
            result.reviewStatus,
            "unassigned"
          );

          await ui(
            panel.getByText(
              "Awaiting Assignment",

              { exact: true }
            )
          ).toBeVisible();
        }
      );

      // =================================
      // TEST GROUP 06
      // =================================

      await group(
        "New assignment and stale-token protection",

        async () => {
          assign(
            acceptedJobId,

            reviewerAccount.email
          );

          const current = await api(
            reviewer,

            `${QUEUE}/${acceptedJobId}`
          );

          assert.notEqual(
            current.assignedAt,
            firstAssignment
          );

          // Previous assignment header
          // must not work for the new cycle.

          await api(
            reviewer,

            `${QUEUE}/${acceptedJobId}/decision`,

            {
              method: "POST",

              status: 409,

              headers: {
                "X-Review-Assignment":
                  firstAssignment,
              },

              body: {
                decision: "resolved",

                localityId: LOCALITY_ID,

                note: finalNote,

                revision: current.revision,
              },
            }
          );

          const panel =
            await openReviewerJob(
              reviewerPage,

              acceptedJobId
            );

          await panel.locator(
            `input[name="review-locality"][value="${LOCALITY_ID}"]`
          ).check();

          await panel
            .getByLabel("Reviewer Reason")
            .fill(finalNote);

          await clickMutation(
            reviewerPage,

            panel.getByRole(
              "button",

              {
                name: "Submit Recommendation",

                exact: true,
              }
            ),

            `${QUEUE}/${acceptedJobId}/decision`
          );

          const fresh = await api(
            merchant,

            `${REVIEWS}/${acceptedJobId}`
          );

          assert.equal(
            fresh.reviewStatus,
            "resolved"
          );

          assert.notEqual(
            fresh.reviewVersion,
            firstReviewVersion
          );

          // The old merchant recommendation
          // token must not accept the new result.

          await api(
            merchant,

            `${REVIEWS}/${acceptedJobId}/decision`,

            {
              method: "POST",

              status: 409,

              body: {
                decision: "accept",

                revision: fresh.revision,

                reviewVersion:
                  firstReviewVersion,
              },
            }
          );
        }
      );

      // =================================
      // TEST GROUP 07
      // =================================

      await group(
        "Merchant acceptance and saved address",

        async () => {
          const panel =
            await openMerchantJob(
              merchantPage,

              acceptedJobId
            );

          await ui(
            panel.getByText(
              finalNote,

              { exact: true }
            )
          ).toBeVisible();

          const accepted =
            await clickMutation(
              merchantPage,

              panel.getByRole(
                "button",

                {
                  name: "Accept Recommendation",

                  exact: true,
                }
              ),

              `${REVIEWS}/${acceptedJobId}/decision`
            );

          assert.equal(
            accepted.status,
            "confirmed"
          );

          assert.equal(
            accepted.selectedCandidate.matchType,

            "manual_review"
          );

          assert.equal(
            accepted.selectedCandidate.score,
            null
          );

          await ui(
            panel.getByText(
              "Recommendation Accepted",

              { exact: true }
            )
          ).toBeVisible();

          const saved =
            await clickMutation(
              merchantPage,

              panel.getByRole(
                "button",

                {
                  name: "Save Address",

                  exact: true,
                }
              ),

              `/p14/saved-addresses/${acceptedJobId}`,

              "PATCH"
            );

          assert.equal(
            saved.saved,
            true
          );

          await ui(
            panel.getByRole(
              "button",

              {
                name: "Remove from Saved",

                exact: true,
              }
            )
          ).toBeVisible();

          const job = await api(
            merchant,

            `/jobs/${acceptedJobId}`
          );

          assert.equal(
            job.saved,
            true
          );

          assert.equal(
            job.selectedCandidate.score,
            null
          );
        }
      );

      // =================================
      // TEST GROUP 08
      // =================================

      await group(
        "Reviewer escalation and merchant visibility",

        async () => {
          const panel =
            await openReviewerJob(
              reviewerPage,

              escalatedJobId
            );

          await panel
            .getByLabel("Reviewer Reason")
            .fill(escalationNote);

          const result =
            await clickMutation(
              reviewerPage,

              panel.getByRole(
                "button",

                {
                  name: "Escalate Request",

                  exact: true,
                }
              ),

              `${QUEUE}/${escalatedJobId}/decision`
            );

          assert.equal(
            result.reviewStatus,
            "escalated"
          );

          const review = await api(
            merchant,

            `${REVIEWS}/${escalatedJobId}`
          );

          assert.equal(
            review.reviewStatus,
            "escalated"
          );

          assert.equal(
            review.canAccept,
            false
          );

          assert.equal(
            review.canRequestReReview,
            false
          );

          const resultPanel =
            await openMerchantJob(
              merchantPage,

              escalatedJobId
            );

          await ui(
            resultPanel.getByText(
              "Escalated",

              { exact: true }
            )
          ).toBeVisible();

          await ui(
            resultPanel.getByRole(
              "button",

              {
                name: "Accept Recommendation",

                exact: true,
              }
            )
          ).toHaveCount(0);
        }
      );

      // =================================
      // TEST GROUP 09
      // =================================

      await group(
        "History, bookmarks, analytics and statistics",

        async () => {
          const history = await api(
            merchant,

            "/p14/address-history?limit=20"
          );

          const accepted =
            history.items.find(
              (item) =>
                item.jobId === acceptedJobId
            );

          assert.ok(accepted);

          assert.equal(
            accepted.status,
            "confirmed"
          );

          assert.equal(
            accepted.saved,
            true
          );

          assert.equal(
            accepted.selectedCandidate.matchType,

            "manual_review"
          );

          assert.equal(
            accepted.selectedCandidate.score,
            null
          );

          const bookmarks = await api(
            merchant,

            "/p14/saved-addresses?limit=20"
          );

          assert.ok(
            bookmarks.items.some(
              (item) =>
                item.jobId === acceptedJobId
            )
          );

          const analytics = await api(
            merchant,

            "/p14/analytics"
          );

          assert.equal(
            analytics.summary.total,
            2
          );

          assert.equal(
            analytics.summary.confirmed,
            1
          );

          assert.equal(
            analytics.summary.reviewRequested,
            1
          );

          assert.equal(
            analytics.summary.saved,
            1
          );

          const stats = await api(
            reviewer,

            STATS
          );

          assert.deepEqual(
            stats.summary,

            {
              pending: 0,
              resolved: 1,
              escalated: 1,
              merchantAccepted: 1,
            }
          );

          // Confirm that the existing pages
          // display the accepted address.

          await merchantPage.goto(
            `${WEB}/dashboard/history/`
          );

          await ui(
            merchantPage
              .getByText(acceptedAddress)
              .first()
          ).toBeVisible();

          await merchantPage.goto(
            `${WEB}/dashboard/saved/`
          );

          await ui(
            merchantPage
              .getByText(acceptedAddress)
              .first()
          ).toBeVisible();

          // Open history details to verify
          // human review display.

          await merchantPage.goto(
            `${WEB}/dashboard/history/`
          );

          await ui(
            merchantPage
              .getByText(acceptedAddress)
              .first()
          ).toBeVisible();
        }
      );

      // =================================
      // TEST GROUP 10
      // =================================

      await group(
        "Database encryption and audit evidence",

        async () => {
          runBackendScript(
            "scripts/verify-review-flow.js",

            [
              acceptedJobId,
              escalatedJobId,
              marker,
            ]
          );
        }
      );

      // =================================
      // TEST GROUP 11
      // =================================

      await group(
        "Logout and protected route verification",

        async () => {
          await merchantPage
            .getByRole(
              "button",

              {
                name: "Sign Out",

                exact: true,
              }
            )
            .click();

          await ui(
            merchantPage
          ).toHaveURL(
            /\/login\/?$/
          );

          await api(
            merchant,

            "/p14/address-history",

            { status: 401 }
          );

          await reviewerPage
            .getByRole(
              "button",

              {
                name: "Sign Out",

                exact: true,
              }
            )
            .click();

          await ui(
            reviewerPage
          ).toHaveURL(
            /\/login\/?$/
          );

          await api(
            reviewer,

            STATS,

            { status: 401 }
          );

          await merchantPage.goto(
            `${WEB}/dashboard/reviews/`
          );

          await ui(
            merchantPage
          ).toHaveURL(
            /\/login\/?$/
          );

          await reviewerPage.goto(
            `${WEB}/dashboard/reviewer/`
          );

          await ui(
            reviewerPage
          ).toHaveURL(
            /\/login\/?$/
          );
        }
      );

      // =================================
      // FINAL RESULT
      // =================================

      console.log(
        "\n================================"
      );

      console.log(
        "FINAL INTEGRATION RESULT"
      );

      console.log(
        "Total Test Groups: 11"
      );

      console.log(
        "Passed:", passed
      );

      console.log(
        "Failed: 0"
      );

      console.log(
        "ALL 11 INTEGRATION TEST GROUPS PASSED"
      );

      console.log(
        "================================\n"
      );

    } catch (error) {
      console.error(
        `[FAILED] Completed groups: ${passed}/11`
      );

      throw error;

    } finally {
      // Revoke any remaining sessions,
      // even if a test fails.

      for (const context of [
        merchant,
        reviewer,
      ]) {
        try {
          const cookies =
            await context.cookies();

          const sessionExists =
            cookies.some(
              (cookie) =>
                cookie.name ===
                  "thikanahub_session"
            );

          if (sessionExists) {
            await api(
              context,

              "/auth/logout",

              {
                method: "POST",
              }
            );
          }

        } catch (error) {
          console.warn(
            "[CLEANUP_WARNING]",

            error.message
          );

        } finally {
          await context.close();
        }
      }

      console.log(
        "[CLEANUP] Browser contexts closed"
      );
    }
  }
);