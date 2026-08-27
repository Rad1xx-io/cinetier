import { test, expect } from "@playwright/test";

/**
 * The one thing the unit suite cannot see: whether `PostHogProvider` actually
 * initialises the real SDK against the real compiled bundle, and whether the
 * magic-link form still works end to end once it does.
 *
 * The call chain from a click to `client.capture(...)` is already proven by
 * unit tests — `magic-link-signup-started.test.tsx` drives the real component
 * and spies `trackSignupStarted`; `analytics-tracker.test.ts` proves `trackEvent`
 * reaches every registered provider; `posthog-provider.test.ts` proves that
 * provider forwards correctly to `client.capture`. What none of those touch is
 * posthog-js itself: this project imports it as an ES module rather than the
 * snippet, so it never lands on `window.posthog` for a test to hook — the only
 * externally observable sign of life is the network calls its own `init()`
 * makes. Catching those here is what the config.js/flags requests below prove:
 * the SDK is genuinely live in the shipped bundle, not only present in a
 * jsdom-mocked unit test.
 */

test("PostHog initialises for real in the built app, and the magic-link form still works", async ({
  page,
}) => {
  const posthogInitRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("stub.posthog.test")) posthogInitRequests.push(r.url());
  });

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
  // PostHog's own init sequence — feature flags and remote config — answered
  // so the SDK settles normally rather than retrying against a host that does
  // not exist.
  await page.route("**/stub.posthog.test/**", (route) => {
    const url = route.request().url();
    if (url.includes("/flags")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"featureFlags":{}}' });
    }
    return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });

  await page.goto("/");

  // Proof the SDK is live: with the stub key configured, PostHogProvider's
  // `posthog.init` makes real requests to the configured host — silence here
  // would mean the provider never mounted, or init silently failed. A longer
  // timeout than the suite's default: this test shares the page with ten
  // parallel browser contexts under CI load, and the tighter global default
  // is tuned for the lighter checks elsewhere in this file, not for waiting
  // on a real SDK's own network round trip.
  await expect.poll(() => posthogInitRequests.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(posthogInitRequests.some((u) => u.includes("/flags"))).toBe(true);

  // The form this session's signup_started fires from, exercised for real —
  // if PostHogProvider's mount had broken the page, this would never reach
  // "Link sent".
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  await page.getByLabel("Email address").fill("reader@example.test");
  await page.getByRole("button", { name: /send me a link/i }).click();

  await expect(page.getByText(/link sent/i)).toBeVisible({ timeout: 20_000 });
});
