import { test, expect, type Page } from "@playwright/test";

/**
 * A "YouTube" post, seen from the feed, on the real built page.
 *
 * PublishPostDialog never had a `channels` prop before this, so a "YouTube"
 * post always froze an empty snapshot no matter what the author had ranked.
 * This checks the fixed round trip end to end: a snapshot that actually holds
 * a channel renders that channel — on the card, capped, and in the dialog,
 * in full — rather than "this author has not published their list".
 */

const POST_ID = "8f2e4a3a-9b8e-4d1e-8f2e-4a3a9b8e2b6a";
const AUTHOR_ID = "author-1";

const post = {
  id: POST_ID,
  user_id: AUTHOR_ID,
  username: "rad1xx",
  display_name: "Rad1xx",
  title: "My favourite channels",
  description: "",
  category: "youtube",
  views_count: 0,
  likes_count: 0,
  comments_count: 0,
  is_public: true,
  allow_fork: true,
  donation_url: null,
  created_at: "2026-08-30T12:00:00Z",
};

const publication = {
  post_id: POST_ID,
  // No titles at all — a "YouTube" post's own catalogue is channels, not
  // ranked_titles. thumbnail_url is left null so the test needs no real image.
  snapshot: { titles: [], channels: [{ channelId: "chan-a", tier: "S", order: 0 }] },
};

const rankedChannel = {
  user_id: AUTHOR_ID,
  channel_id: "chan-a",
  title: "Chill Channel",
  thumbnail_url: null,
  country: null,
  tier: "S",
  order: 0,
  subscriber_count: null,
  added_at: 0,
  updated_at: 0,
};

/** Answers every call the page makes, so the test needs no database. */
async function stubTheDatabase(page: Page) {
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { session: null } }) })
  );

  await page.route("**/rest/v1/**", (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("/post_feed")) return json([post]);
    if (url.includes("/ranked_title_publications")) return json([publication]);
    if (url.includes("/ranked_channels")) return json([rankedChannel]);
    // ranked_titles, post_comments, post_likes and everything else: nothing.
    return json([]);
  });
}

test("a YouTube post's channel shows on the card, not the empty-board placeholder", async ({ page }) => {
  await stubTheDatabase(page);
  await page.goto("/feed");

  const card = page.getByRole("article").filter({ hasText: "My favourite channels" });
  await expect(card).toBeVisible();

  await expect(card.getByText(/has not published their list/i)).toHaveCount(0);
  await expect(card.getByText("YouTube")).toBeVisible();
  // No thumbnail stubbed, so ChannelThumbnail's own fallback carries the name.
  await expect(card.getByText(/Chill Channel/i)).toBeVisible();
});

test("opening it shows the channel in full, with its own count line", async ({ page }) => {
  await stubTheDatabase(page);
  await page.goto("/feed");

  await page.getByRole("button", { name: /Open the post/ }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/has not published/i)).toHaveCount(0);
  await expect(dialog.getByText(/1 channel across one tier/i)).toBeVisible();
  await expect(dialog.getByText(/Chill Channel/i)).toBeVisible();
});
