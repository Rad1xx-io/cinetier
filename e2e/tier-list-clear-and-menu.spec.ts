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

/**
 * Two catalogs on the same board, the shape the production report was filed
 * against: a board with several films and several TV titles, the kind that
 * only exists once somebody has ranked more than one kind of thing.
 */
async function seedMixed(page: Page, movies: number, tv: number) {
  await page.goto("/tier-list");
  await page.evaluate(
    ({ movies, tv }) => {
      const now = Date.now();
      const titles = [
        ...Array.from({ length: movies }, (_, i) => ({
          tmdbId: 1000 + i,
          mediaType: "movie",
          title: `Fixture film ${i}`,
          posterPath: null,
          releaseDate: "2020-01-01",
          tier: "S",
          order: i,
          addedAt: now,
          updatedAt: now,
        })),
        ...Array.from({ length: tv }, (_, i) => ({
          tmdbId: 2000 + i,
          mediaType: "tv",
          title: `Fixture show ${i}`,
          posterPath: null,
          releaseDate: "2020-01-01",
          tier: "A",
          order: i,
          addedAt: now,
          updatedAt: now,
        })),
      ];
      localStorage.setItem("cinetier:rankings:v1", JSON.stringify(titles));
    },
    { movies, tv }
  );
  await page.reload();
}

async function readTitles(page: Page): Promise<{ tmdbId: number; mediaType: string }[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("cinetier:rankings:v1") ?? "[]"));
}

/** Switches the picker to another catalog, the way a person actually would. */
async function pickCatalog(page: Page, label: "Films" | "TV" | "Anime" | "Games" | "YouTube") {
  await page.getByRole("button", { name: /choose a list$/ }).click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${label}`) }).click();
}

test("Clear list asks how many titles, then empties the board", async ({ page }) => {
  // Nothing but films here, so clearing the active catalog (Films, the only
  // one stocked) happens to empty the whole board — this is the case where
  // scoped and whole-board clearing look identical from the outside.
  await seedTitles(page, 5);
  await expect(page.getByRole("heading", { name: "Tier list" })).toBeVisible();

  let confirmMessage = "";
  page.once("dialog", (dialog) => {
    confirmMessage = dialog.message();
    void dialog.accept();
  });

  await page.getByRole("button", { name: "More list actions" }).click();
  await page.getByText("Clear list").click();

  expect(confirmMessage).toContain("5 Film titles");

  await expect(page.getByText("Your tier list is empty")).toBeVisible();
  expect(await readTitles(page)).toHaveLength(0);
});

/*
 * The production report, reproduced: looking at Films with TV also on the
 * board, "Clear list" used to remove both and say "8 titles" while somebody
 * was looking at 3. This is the negative control for that — reverting the
 * source fix and running just this test shows the confirm text back to "8"
 * and the TV titles gone along with the films.
 */
test("Clear list on Films leaves TV exactly as it was", async ({ page }) => {
  await seedMixed(page, 3, 5);
  await pickCatalog(page, "Films");

  let confirmMessage = "";
  page.once("dialog", (dialog) => {
    confirmMessage = dialog.message();
    void dialog.accept();
  });

  await page.getByRole("button", { name: "More list actions" }).click();
  await page.getByText("Clear list").click();

  expect(confirmMessage).toContain("3 Film titles");
  expect(confirmMessage).not.toContain("8");

  const remaining = await readTitles(page);
  expect(remaining).toHaveLength(5);
  expect(remaining.every((t) => t.mediaType === "tv")).toBe(true);
});

test("switching the filter changes what Clear list removes — nothing is cached", async ({ page }) => {
  await seedMixed(page, 3, 5);
  // Films is what a fresh board opens on; switching to TV before ever
  // opening the menu is what proves the count is read at click time.
  await pickCatalog(page, "TV");

  let confirmMessage = "";
  page.once("dialog", (dialog) => {
    confirmMessage = dialog.message();
    void dialog.accept();
  });

  await page.getByRole("button", { name: "More list actions" }).click();
  await page.getByText("Clear list").click();

  expect(confirmMessage).toContain("5 TV titles");

  const remaining = await readTitles(page);
  expect(remaining).toHaveLength(3);
  expect(remaining.every((t) => t.mediaType === "movie")).toBe(true);
});

test("Clear list is not offered while looking at an empty catalog, even with titles elsewhere", async ({
  page,
}) => {
  await seedMixed(page, 3, 5);
  await pickCatalog(page, "Games");

  await page.getByRole("button", { name: "More list actions" }).click();
  await expect(page.getByText("Clear list")).toHaveCount(0);
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
