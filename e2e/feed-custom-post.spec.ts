import { test, expect, type Page } from "@playwright/test";

/**
 * A board of photographs, published, seen from the feed.
 *
 * This is the check that was missing when a custom post rendered as a film
 * list: the data was right, the card component was right, and the page still
 * showed "this author has not published their list" under a Film badge,
 * because one array in between had never heard of the category.
 */

const POST_ID = "074d4212-f2cd-40f7-adff-7980545a06dc";

const post = {
  id: POST_ID,
  user_id: "u-1",
  username: "rad1xx",
  display_name: "Rad1xx",
  title: "test",
  description: "",
  category: "custom",
  views_count: 0,
  likes_count: 0,
  comments_count: 0,
  is_public: true,
  allow_fork: true,
  donation_url: null,
  created_at: "2026-08-24T19:43:24Z",
};

const publication = {
  post_id: POST_ID,
  list_id: "c189b133-cc61-4804-b081-c337ada0949a",
  snapshot: {
    rows: [
      { id: "row-s", label: "S", color: "#ef4444", position: 0 },
      { id: "row-a", label: "A", color: "#f59e0b", position: 1 },
    ],
    items: [{ id: "item-1", rowId: "row-s", position: 0, caption: "best game" }],
  },
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

    // The feed reads a view that joins the author's handle, not the table.
    if (url.includes("/post_feed")) return json([post]);
    if (url.includes("/custom_list_publications")) return json([publication]);
    if (url.includes("/custom_items")) return json([{ id: "item-1", image_path: "u/l/cover.jpg" }]);
    return json([]);
  });

  // The cover is signed and then fetched; a real picture is not the point here,
  // so both are answered with something valid and tiny.
  await page.route("**/storage/v1/object/sign/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ path: "u/l/cover.jpg", signedURL: "/object/sign/stub", error: null }]),
    })
  );
  await page.route("**/object/sign/stub*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
    })
  );
}

test("a published board of photographs shows its tiers in the feed", async ({ page }) => {
  await stubTheDatabase(page);
  await page.goto("/feed");

  const card = page.getByRole("article").filter({ hasText: "test" }).first();
  await expect(card).toBeVisible();

  // What the bug looked like: the placeholder for an author with no ranked
  // titles, which is not what this author published.
  await expect(card.getByText(/has not published their list/i)).toHaveCount(0);

  // What it should look like: the board's own tiers, and a label that says
  // what kind of post this is.
  await expect(card.getByText("Photos")).toBeVisible();
  await expect(card.getByText("Film")).toHaveCount(0);
  await expect(card.getByText("S", { exact: true })).toBeVisible();
  await expect(card.getByText("A", { exact: true })).toBeVisible();
});

test("opening it shows the board rather than the author's film list", async ({ page }) => {
  await stubTheDatabase(page);
  await page.goto("/feed");

  await page.getByRole("button", { name: /Open the post/ }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/has not published/i)).toHaveCount(0);
  await expect(dialog.getByText("S", { exact: true })).toBeVisible();
  await expect(dialog.getByText("A", { exact: true })).toBeVisible();
  // Forking leads to the author's ranked titles, which this is not.
  await expect(dialog.getByText(/fork/i)).toHaveCount(0);
});
