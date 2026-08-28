import { test, expect, type Page } from "@playwright/test";

/**
 * Reporting a post or a comment from the feed.
 *
 * The custom-uploads report route already existed; this is the same route
 * widened to cover the community feed. What matters here is the UI plumbing —
 * the action shows up in the right place and sends the right subject — not
 * the route itself, which is stubbed rather than exercised for real.
 */

const POST_ID = "074d4212-f2cd-40f7-adff-7980545a06dc";
const COMMENT_ID = "b4b1a6d1-8f2e-4a3a-9b8e-2b6a2f6c9e11";

const post = {
  id: POST_ID,
  user_id: "author-1",
  username: "rad1xx",
  display_name: "Rad1xx",
  title: "test post",
  description: "",
  category: "movie",
  views_count: 0,
  likes_count: 0,
  comments_count: 1,
  is_public: true,
  allow_fork: true,
  donation_url: null,
  created_at: "2026-08-24T19:43:24Z",
};

const comment = {
  id: COMMENT_ID,
  post_id: POST_ID,
  user_id: "someone-else",
  text: "not mine",
  created_at: "2026-08-24T19:44:24Z",
  profiles: { username: "other", display_name: "Other" },
};

interface ReportCall {
  url: string;
  body: { subjectType?: string; subjectId?: string; reason?: string };
}

/** Answers every call the page makes, so the test needs no database. */
async function stubTheDatabase(page: Page, reportCalls: ReportCall[]) {
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { session: null } }) })
  );

  await page.route("**/rest/v1/**", (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("/post_feed")) return json([post]);
    if (url.includes("/post_comments")) return json([comment]);
    return json([]);
  });

  // The route under test is stubbed, not exercised — a signed-out browser hitting
  // it for real would only get the 401 the route already returns for that case,
  // which is not what this spec is checking.
  await page.route("**/api/custom-reports", (route) => {
    reportCalls.push({ url: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
}

test("reporting a post sends its id and the reason typed in", async ({ page }) => {
  const reportCalls: ReportCall[] = [];
  await stubTheDatabase(page, reportCalls);
  await page.goto("/feed");

  await page.getByRole("button", { name: /Open the post/ }).first().click();
  await page.getByRole("button", { name: /more post actions/i }).click();
  await page.getByRole("menuitem", { name: /^report$/i }).click();

  await page.getByPlaceholder(/what is wrong with this/i).fill("Wrong title for this film.");
  await page.getByRole("button", { name: /send report/i }).click();

  await expect(page.getByText(/reported\. thank you/i)).toBeVisible();
  expect(reportCalls).toHaveLength(1);
  expect(reportCalls[0].body).toEqual({
    subjectType: "post",
    subjectId: POST_ID,
    reason: "Wrong title for this film.",
  });
});

test("reporting a comment sends the comment's id, not the post's", async ({ page }) => {
  const reportCalls: ReportCall[] = [];
  await stubTheDatabase(page, reportCalls);
  await page.goto("/feed");

  await page.getByRole("button", { name: /Open the post/ }).first().click();
  await page.getByRole("button", { name: /report this comment/i }).click();

  await page.getByPlaceholder(/what is wrong with this/i).fill("Off-topic reply.");
  await page.getByRole("button", { name: /send report/i }).click();

  await expect(page.getByText(/reported\. thank you/i)).toBeVisible();
  expect(reportCalls).toHaveLength(1);
  expect(reportCalls[0].body).toEqual({
    subjectType: "post_comment",
    subjectId: COMMENT_ID,
    reason: "Off-topic reply.",
  });
});
