import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The same-origin analytics proxy, pinned in the two places it can drift.
 *
 * Firefox's tracking protection blocks `eu-assets.i.posthog.com` at the network
 * layer with default settings, so every event from every Firefox visitor was
 * dropped before it left the browser. The fix routes analytics through this
 * app's own origin — which only works while `vercel.json`'s rewrite prefix and
 * the SDK's `api_host` agree, and while both point at the region the project
 * actually lives in.
 *
 * Configuration-level assertions, in the style of deployment-hardening: the
 * behaviour itself was verified against a deployment, and these exist so that
 * breaking it is a failing test rather than analytics quietly going silent
 * again — which is exactly the failure mode that made this worth fixing, since
 * nothing about it is visible from inside the app.
 */

const vercelJson = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
const rewrites = JSON.parse(vercelJson).rewrites as { source: string; destination: string }[];
const provider = readFileSync(
  join(process.cwd(), "app", "providers", "PostHogProvider.tsx"),
  "utf8"
);
const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

/** The prefix the provider actually hands to `api_host`. */
const providerPath = /const ANALYTICS_PROXY_PATH = "([^"]+)"/.exec(provider)?.[1];

describe("the proxy prefix the browser calls and the one Vercel rewrites", () => {
  it("is the same string in both files", () => {
    expect(providerPath).toBeTruthy();
    for (const rule of rewrites) {
      expect(rule.source.startsWith(`${providerPath}/`)).toBe(true);
    }
  });

  it("is not a name a blocklist looks for", () => {
    // PostHog's own docs: blockers match on path as well as domain, so an
    // obvious prefix reintroduces the problem the proxy exists to solve.
    for (const bait of ["analytics", "tracking", "telemetry", "posthog", "ingest"]) {
      expect(providerPath?.includes(bait)).toBe(false);
    }
  });
});

describe("the rewrites themselves", () => {
  it("routes the asset and array paths to the assets host, and everything else to ingest", () => {
    const byPurpose = Object.fromEntries(
      rewrites.map((r) => [r.source.replace(`${providerPath}/`, "").split("/")[0], r.destination])
    );

    expect(byPurpose["static"]).toContain("eu-assets.i.posthog.com");
    expect(byPurpose["array"]).toContain("eu-assets.i.posthog.com");
    // The catch-all, whose "purpose" segment is the wildcard itself.
    expect(rewrites[rewrites.length - 1].destination).toBe("https://eu.i.posthog.com/:path");
  });

  it("keeps the catch-all last, or it would swallow the two specific rules", () => {
    const catchAllIndex = rewrites.findIndex((r) => r.source === `${providerPath}/:path(.*)`);
    expect(catchAllIndex).toBe(rewrites.length - 1);
  });

  it("stays on the region the project is actually in", () => {
    // A region mismatch does not fail cleanly — PostHog's docs say it surfaces
    // as 401s only once deployed, which is the hardest kind of thing to notice.
    for (const rule of rewrites) {
      expect(rule.destination).toMatch(/^https:\/\/eu(-assets)?\.i\.posthog\.com\//);
      expect(rule.destination).not.toContain("us.i.posthog.com");
      expect(rule.destination).not.toContain("us-assets.i.posthog.com");
    }
  });
});

describe("the SDK is pointed at the proxy, not at PostHog directly", () => {
  it("uses the proxy path as api_host", () => {
    expect(provider).toContain("api_host: ANALYTICS_PROXY_PATH");
    // The old form, which is what tracking protection was blocking.
    expect(provider).not.toMatch(/api_host:\s*host\b/);
  });

  it("still sets ui_host, so PostHog's own links do not point at the proxy", () => {
    expect(provider).toContain("ui_host:");
  });
});

describe("the trailing slash PostHog's ingest paths end in", () => {
  it("is not redirected away by Next before the rewrite can see it", () => {
    /*
     * `/i/v0/e/` and `/decide/` end in a slash. Next normalises that away with
     * a 308, and Vercel processes redirects before rewrites — so every event
     * cost two round trips, the first thrown away. Measured against a
     * production build with no rewrite present: the POST returned 308 before
     * this setting and 404 after, which is what proves the redirect was Next's
     * own and had nothing to do with the proxy.
     */
    expect(nextConfig).toContain("skipTrailingSlashRedirect: true");
  });
});

describe("the dmn_chk cookie probe", () => {
  it("is turned off, since this app is a single hostname", () => {
    // posthog-js finds the widest cookie domain by trying to set one per
    // hostname suffix, starting at `.com` — which browsers refuse, and Firefox
    // reports as `rejected for invalid domain` on every load. Nothing here
    // shares a session across subdomains, so the probe buys nothing.
    expect(provider).toContain("cross_subdomain_cookie: false");
  });
});

describe("the two rewrite mechanisms are not both in play", () => {
  it("leaves next.config.ts without rewrites of its own", () => {
    // PostHog's docs are explicit that vercel.json and next.config rewrites
    // may conflict, and to pick one.
    expect(nextConfig).not.toMatch(/async\s+rewrites\s*\(/);
  });

  it("no longer names a third-party analytics origin in the policy", () => {
    // Same-origin traffic is covered by 'self'; naming the ingest host now
    // would be widening the policy for something nothing requests.
    expect(nextConfig).not.toContain("POSTHOG_ORIGIN");
    expect(nextConfig).not.toMatch(/connect-src[^\n]*posthog/);
  });
});
