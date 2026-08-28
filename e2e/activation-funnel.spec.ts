import { test, expect } from "@playwright/test";

/**
 * The magic-link form, run against the real compiled bundle rather than a
 * jsdom mock — the level `magic-link-signup-started.test.tsx` cannot reach.
 *
 * Not a proof that PostHog's own SDK transmits `signup_started` over the
 * wire: this suite's build carries no `NEXT_PUBLIC_POSTHOG_KEY`, matching
 * every other spec here, so `PostHogProvider.start()` returns before
 * `posthog.init` is ever called — see the note in playwright.config.ts for
 * why a real key was tried and reverted (it made every *other* spec's page
 * attempt real network requests to an unreachable host in the background,
 * which is a risk to the whole suite for one test's benefit). The call chain
 * from a click through `trackEvent` to the PostHog provider's own
 * `client.capture(...)` is proven end to end by the unit suite instead —
 * `magic-link-signup-started.test.tsx`, `analytics-tracker.test.ts` and the
 * pre-existing `posthog-provider.test.ts` between them.
 *
 * What this file adds on top of that: the real click sequence, on the real
 * built page, still reaches "Link sent" — so nothing about wiring the new
 * event into the form broke the form itself.
 */
test("the magic-link form still reaches 'Link sent' in the real built app", async ({ page }) => {
  await page.route("**/auth/v1/otp", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { session: null } }),
    })
  );
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );

  await page.goto("/");
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  await page.getByLabel("Email address").fill("reader@example.test");
  await page.getByRole("button", { name: /send me a link/i }).click();

  await expect(page.getByText(/link sent/i)).toBeVisible();
});
