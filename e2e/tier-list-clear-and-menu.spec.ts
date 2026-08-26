import { test, expect, type Page } from "@playwright/test";

/**
 * Two things that unit tests cannot see: an irreversible action carried out
 * through the real menu on the real page, and whether that menu is actually
 * where a finger can reach it once a phone-width screen makes the toolbar
 * wrap. The overflow menu shipped with both broken at once — a `z-30` tie
 * with the tier list's own sticky filter bar hid it, and its `right-0`
 * anchor, measured against a trigger that had wrapped onto the start of its
 * own line, put the panel off the left edge of the phone. Neither survived a
 * unit test, because jsdom does no layout.
 */

/**
 * Titles made up on the spot rather than fetched from `/api/tmdb/popular`.
 *
 * The board only needs *something* ranked — no test here reads a poster or a
 * release date — and a real fetch would need `TMDB_API_TOKEN`, which the CI
 * browser job does not have and should not need: this suite's whole premise,
 * stated in `playwright.config.ts`, is that nothing here depends on a network
 * being reachable. That premise held for the storage stubs and broke quietly
 * for a plain `fetch` — the kind of gap that only shows up once CI runs it
 * somewhere the local machine's own `.env.local` isn't standing in the way.
 */
async function seedTitles(page: Page, count: number) {
  await page.goto("/tier-list");
  await page.evaluate((n) => {
    const now = Date.now();
    const titles = Array.from({ length: n }, (_, i) => ({
      tmdbId: 1000 + i,
      mediaType: "movie",
      title: `Fixture film ${i}`,
      posterPath: null,
      releaseDate: "2020-01-01",
      tier: "S",
      order: i,
      addedAt: now,
      updatedAt: now,
    }));
    localStorage.setItem("cinetier:rankings:v1", JSON.stringify(titles));
  }, count);
  await page.reload();
}

test("Clear list asks how many titles, then empties the board", async ({ page }) => {
  await seedTitles(page, 5);
  await expect(page.getByRole("heading", { name: "Tier list" })).toBeVisible();

  let confirmMessage = "";
  page.once("dialog", (dialog) => {
    confirmMessage = dialog.message();
    void dialog.accept();
  });

  await page.getByRole("button", { name: "More list actions" }).click();
  await page.getByText("Clear list").click();

  expect(confirmMessage).toContain("5");
  expect(confirmMessage.toLowerCase()).toContain("tiers stay");

  await expect(page.getByText("Your tier list is empty")).toBeVisible();
  const remaining = await page.evaluate(
    () => JSON.parse(localStorage.getItem("cinetier:rankings:v1") ?? "[]").length
  );
  expect(remaining).toBe(0);
});

test("declining the confirmation leaves the list exactly as it was", async ({ page }) => {
  await seedTitles(page, 3);

  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "More list actions" }).click();
  await page.getByText("Clear list").click();

  const remaining = await page.evaluate(
    () => JSON.parse(localStorage.getItem("cinetier:rankings:v1") ?? "[]").length
  );
  expect(remaining).toBe(3);
});

test("the overflow menu opens fully inside a 375px viewport, every item reachable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  // Four visible buttons (Custom, Publish, Taste Battle, ···) do not fit on
  // one 375px line — this is the exact wrap that broke the anchor.
  await seedTitles(page, 4);

  await page.getByRole("button", { name: "More list actions" }).click();
  const panel = page.getByRole("menu");
  await expect(panel).toBeVisible();

  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);

  // Not just "on screen" — actually the topmost element at its own centre,
  // which is what a tie in z-index with the sticky filter bar broke.
  const hitTestable = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    return items.every((item) => {
      const r = item.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top === item || item.contains(top);
    });
  });
  expect(hitTestable).toBe(true);
});
