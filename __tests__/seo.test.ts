import { afterEach, describe, expect, it, vi } from "vitest";
import {
  absoluteUrl,
  CRAWLER_DISALLOW,
  PROFILE_PRIORITY,
  SITE_URL,
  SITEMAP_ROUTES,
} from "@/lib/seo/site";

// Mocked rather than imported: the real module is server-only, and the point of
// these tests is the shape of the sitemap, not Supabase's client.
const listPublicProfiles = vi.fn();
vi.mock("@/lib/supabase/public-read", () => ({
  listPublicProfiles: () => listPublicProfiles(),
  PUBLIC_PROFILE_LIMIT: 10_000,
}));

const { default: sitemap } = await import("@/app/sitemap");
const { default: robots } = await import("@/app/robots");

const profile = (username: string, iso: string) => ({
  username,
  updatedAt: new Date(iso),
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("absoluteUrl", () => {
  it("joins a rooted path to the origin", () => {
    expect(absoluteUrl("/feed")).toBe(`${SITE_URL}/feed`);
  });

  it("tolerates a path handed over without its leading slash", () => {
    expect(absoluteUrl("feed")).toBe(`${SITE_URL}/feed`);
  });

  it("never doubles the slash on the root", () => {
    expect(absoluteUrl("/")).toBe(`${SITE_URL}/`);
    expect(SITE_URL.endsWith("/")).toBe(false);
  });
});

describe("sitemap — static routes", () => {
  it("names the paths this app actually serves", () => {
    const paths = SITEMAP_ROUTES.map((r) => r.path);
    // Films live at /discover; /movies has never been a route here.
    expect(paths).toContain("/discover");
    expect(paths).not.toContain("/movies");
    expect(paths).toEqual(expect.arrayContaining(["/", "/feed", "/anime", "/games", "/youtube"]));
  });

  it("lists them first, in declaration order", async () => {
    listPublicProfiles.mockResolvedValue([]);
    const entries = await sitemap();
    expect(entries.map((e) => e.url)).toEqual(SITEMAP_ROUTES.map((r) => absoluteUrl(r.path)));
  });

  it("ranks the home page above the rest", async () => {
    listPublicProfiles.mockResolvedValue([]);
    const entries = await sitemap();
    const home = entries.find((e) => e.url === absoluteUrl("/"));
    expect(home?.priority).toBe(1);
    for (const entry of entries) {
      expect(entry.priority ?? 0).toBeLessThanOrEqual(home?.priority ?? 0);
    }
  });

  it("stamps one build time across them rather than a fresh one each", async () => {
    listPublicProfiles.mockResolvedValue([]);
    const first = await sitemap();
    const stamps = new Set(first.map((e) => String(e.lastModified)));
    expect(stamps.size).toBe(1);
    // Re-invoking must not move it: a sitemap that claims every page changed on
    // every crawl teaches the crawler to ignore the field.
    const second = await sitemap();
    expect(String(second[0].lastModified)).toBe(String(first[0].lastModified));
  });

  it("excludes the routes that should never be a search result", async () => {
    listPublicProfiles.mockResolvedValue([]);
    const urls = (await sitemap()).map((e) => e.url).join(" ");
    for (const path of ["/settings", "/profile", "/widgets", "/battle", "/api"]) {
      expect(urls).not.toContain(path);
    }
  });
});

describe("sitemap — published profiles", () => {
  it("appends one entry per published profile", async () => {
    listPublicProfiles.mockResolvedValue([
      profile("anya", "2026-08-01T10:00:00Z"),
      profile("boris", "2026-07-20T09:00:00Z"),
    ]);

    const entries = await sitemap();
    expect(entries).toHaveLength(SITEMAP_ROUTES.length + 2);
    expect(entries.slice(-2).map((e) => e.url)).toEqual([
      `${SITE_URL}/u/anya`,
      `${SITE_URL}/u/boris`,
    ]);
  });

  it("dates each one from the profile itself, not from the build", async () => {
    listPublicProfiles.mockResolvedValue([profile("anya", "2026-08-01T10:00:00Z")]);

    const entries = await sitemap();
    const own = entries.find((e) => e.url === `${SITE_URL}/u/anya`);
    expect(new Date(own!.lastModified as Date).toISOString()).toBe("2026-08-01T10:00:00.000Z");
    // Distinct from the static routes' shared build stamp.
    expect(String(own!.lastModified)).not.toBe(String(entries[0].lastModified));
  });

  it("gives them their own priority and cadence", async () => {
    listPublicProfiles.mockResolvedValue([profile("anya", "2026-08-01T10:00:00Z")]);

    const own = (await sitemap()).find((e) => e.url === `${SITE_URL}/u/anya`);
    expect(own?.priority).toBe(PROFILE_PRIORITY);
    expect(own?.changeFrequency).toBe("weekly");
  });

  it("escapes a handle rather than pasting it into the URL raw", async () => {
    listPublicProfiles.mockResolvedValue([profile("a b/c", "2026-08-01T10:00:00Z")]);

    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}/u/a%20b%2Fc`);
  });

  it("still serves the static routes when the database gives nothing back", async () => {
    // The loader swallows its own failures, so an outage arrives here as [].
    listPublicProfiles.mockResolvedValue([]);

    const entries = await sitemap();
    expect(entries).toHaveLength(SITEMAP_ROUTES.length);
    expect(entries[0].url).toBe(absoluteUrl("/"));
  });

  it("keeps every URL absolute — a crawler has no base to resolve against", async () => {
    listPublicProfiles.mockResolvedValue([profile("anya", "2026-08-01T10:00:00Z")]);

    for (const entry of await sitemap()) {
      expect(entry.url.startsWith("https://")).toBe(true);
    }
  });

  it("keeps priorities inside the range the spec allows", async () => {
    listPublicProfiles.mockResolvedValue([profile("anya", "2026-08-01T10:00:00Z")]);

    for (const entry of await sitemap()) {
      expect(entry.priority ?? 0).toBeGreaterThan(0);
      expect(entry.priority ?? 0).toBeLessThanOrEqual(1);
    }
  });
});

describe("robots", () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

  it("lets every crawler in", () => {
    expect(rules?.userAgent).toBe("*");
    expect(rules?.allow).toBe("/");
  });

  it("holds back what is not a page", () => {
    expect(rules?.disallow).toEqual(CRAWLER_DISALLOW);
    expect(CRAWLER_DISALLOW).toContain("/api/");
    expect(CRAWLER_DISALLOW).toContain("/auth/");
  });

  it("keeps the chromeless widget out, so it cannot compete with the real page", () => {
    expect(CRAWLER_DISALLOW).toContain("/widgets/");
  });

  it("leaves published profiles crawlable, since the sitemap advertises them", () => {
    expect(CRAWLER_DISALLOW.some((path) => "/u/".startsWith(path))).toBe(false);
  });

  it("points at the sitemap by absolute URL", () => {
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("agrees with the sitemap about which host this is", () => {
    expect(result.host).toBe(SITE_URL);
    expect(String(result.sitemap).startsWith(String(result.host))).toBe(true);
  });
});
