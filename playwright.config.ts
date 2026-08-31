import { defineConfig, devices } from "@playwright/test";

/**
 * The one level of testing the unit suite cannot reach.
 *
 * A published board of photographs rendered as a film list in the feed, and
 * every unit test passed while it did: the data layer was covered, the card
 * was covered, and the one thing nobody checked was whether the feed — the
 * real page, with its real bundle — showed the thing. This runs that page in
 * a browser.
 *
 * Network is stubbed in the tests themselves, so nothing here depends on a
 * database being reachable or holding any particular row.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Built and served rather than `next dev`: the point is the bundle a
    // visitor actually receives.
    command: "npm run build && npm run start -- --port 3100",
    url: "http://127.0.0.1:3100/feed",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      // Inlined at build time. Any syntactically valid values will do — every
      // request to them is intercepted before it leaves the page.
      //
      // Deliberately no NEXT_PUBLIC_POSTHOG_KEY/HOST here. This is one build
      // shared by every spec in the suite, and a real key would make
      // PostHogProvider genuinely call `posthog.init` — and therefore attempt
      // real network requests — in the background of every test in this
      // directory, not only the one that wants to look at them. A `.test`
      // top-level domain is guaranteed to never resolve, but how *quickly* a
      // given environment's resolver gives up on it is not guaranteed, and
      // that difference is exactly the kind of thing that is invisible on one
      // machine and flaky on another. With no key, `PostHogProvider.start()`
      // returns before `posthog.init` is ever called — the same state every
      // other spec in this suite already runs against.
      NEXT_PUBLIC_SUPABASE_URL: "https://stub.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub-anon-key",
      /*
       * Builds `/e2e/custom-board` into this bundle and no other.
       *
       * The fixture used to be in every build, production included, where it
       * answered 200 to anyone who guessed the path. It is read at module
       * scope in the page, so this variable decides whether the route exists
       * in the bundle rather than whether it responds — and it is set here,
       * where `command` runs both the build and the server.
       */
      E2E_FIXTURES: "true",
    },
  },
});
