import { test, expect, type Page } from "@playwright/test";

/**
 * Clearing a custom board for real: click, confirm, watch the cards go and
 * the storage cleanup fire — the level the unit suite cannot reach, since
 * `fakeClient` in `custom-storage-cleanup.test.ts` proves the call order but
 * never proves a browser actually gets there from the menu.
 *
 * Runs against `/e2e/custom-board`, a permanent fixture — the real board page
 * resolves on the server before anything reaches the browser, which puts it
 * out of reach for `page.route`. See that route's own comment.
 */

/** Answers the calls `clearCustomBoard` makes, and remembers whether storage was asked to clean up. */
function stubClearBoard(page: Page) {
  let storageRemoveCalled = false;
  let clearCalled = false;

  /*
   * Clearing is `clear_custom_board` now, not a DELETE. Migration 029 revoked
   * the client's delete privilege so that the choice between deleting a card
   * and detaching one a published post still shows is made in the database —
   * so this is the call that has to arrive.
   */
  page.route("**/rest/v1/rpc/clear_custom_board", (route) => {
    clearCalled = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: "2" });
  });

  page.route("**/rest/v1/custom_items**", (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    // The first read collects what the board is about to lose; the second
    // (queried by path, from inside removeUnreferencedFiles) asks what still
    // refers to those paths — empty, since the rows that did were just deleted.
    if (url.includes("list_id=eq.")) {
      return json([
        { image_path: "e2e-fixture-user/e2e-fixture-list/one.jpg" },
        { image_path: "e2e-fixture-user/e2e-fixture-list/two.jpg" },
      ]);
    }
    return json([]);
  });

  page.route("**/rest/v1/custom_tier_rows**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );

  page.route("**/storage/v1/object/**", (route) => {
    if (route.request().method() === "DELETE") storageRemoveCalled = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  return {
    clearWasCalled: () => clearCalled,
    storageWasCleaned: () => storageRemoveCalled,
  };
}

test("Clear board asks how many cards, then removes them and their files, leaving the tiers", async ({ page }) => {
  const calls = stubClearBoard(page);

  await page.goto(`/e2e/custom-board`);
  await expect(page.getByText("first card")).toBeVisible();
  await expect(page.getByText("second card")).toBeVisible();

  let confirmMessage = "";
  page.once("dialog", (dialog) => {
    confirmMessage = dialog.message();
    void dialog.accept();
  });

  await page.getByRole("button", { name: "More board actions" }).click();
  await page.getByText("Clear board").click();

  // Named, not vague: the dialog says how many cards, not just "clear it".
  expect(confirmMessage).toContain("2");
  expect(confirmMessage.toLowerCase()).toContain("tiers stay");

  await expect(page.getByText("first card")).toHaveCount(0);
  await expect(page.getByText("second card")).toHaveCount(0);

  // The two starter tiers are still on the board — cleared, not deleted. Their
  // labels are editable inputs for the owner, so it is the value being read,
  // not text content.
  await expect(page.getByRole("textbox", { name: "Tier name" }).nth(0)).toHaveValue("S");
  await expect(page.getByRole("textbox", { name: "Tier name" }).nth(1)).toHaveValue("A");

  await expect.poll(() => calls.clearWasCalled()).toBe(true);
  await expect.poll(() => calls.storageWasCleaned()).toBe(true);
});

test("declining the confirmation leaves the board untouched", async ({ page }) => {
  const calls = stubClearBoard(page);

  await page.goto(`/e2e/custom-board`);
  page.once("dialog", (dialog) => void dialog.dismiss());

  await page.getByRole("button", { name: "More board actions" }).click();
  await page.getByText("Clear board").click();

  await expect(page.getByText("first card")).toBeVisible();
  await expect(page.getByText("second card")).toBeVisible();
  expect(calls.clearWasCalled()).toBe(false);
});
