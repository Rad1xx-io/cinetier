import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const listRankedEntries = vi.fn();
const listRankedChannels = vi.fn();
vi.mock("@/lib/supabase/public-read", () => ({
  listPublicProfiles: () => listPublicProfiles(),
  listRankedEntries: () => listRankedEntries(),
  listRankedChannels: () => listRankedChannels(),
  PUBLIC_PROFILE_LIMIT: 10_000,
  RANKED_ENTRY_LIMIT: 10_000,
}));

const { default: sitemap } = await import("@/app/sitemap");
const { default: robots } = await import("@/app/robots");

const profile = (username: string, iso: string) => ({
  username,
  updatedAt: new Date(iso),
});

const entry = (slug: string, iso: string) => ({ slug, updatedAt: new Date(iso) });

const NO_ENTRIES = { titles: [], anime: [], games: [] };

beforeEach(() => {
  // Every case opts in to whatever dynamic rows it needs; the default is a
  // database with nothing published in it.
  listPublicProfiles.mockResolvedValue([]);
  listRankedEntries.mockResolvedValue(NO_ENTRIES);
  listRankedChannels.mockResolvedValue([]);
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
    const entries = await sitemap();
    expect(entries.map((e) => e.url)).toEqual(SITEMAP_ROUTES.map((r) => absoluteUrl(r.path)));
  });

  it("ranks the home page above the rest", async () => {
    const entries = await sitemap();
    const home = entries.find((e) => e.url === absoluteUrl("/"));
    expect(home?.priority).toBe(1);
    for (const entry of entries) {
      expect(entry.priority ?? 0).toBeLessThanOrEqual(home?.priority ?? 0);
    }
  });

  it("stamps one build time across them rather than a fresh one each", async () => {
    const first = await sitemap();
    const stamps = new Set(first.map((e) => String(e.lastModified)));
    expect(stamps.size).toBe(1);
    // Re-invoking must not move it: a sitemap that claims every page changed on
    // every crawl teaches the crawler to ignore the field.
    const second = await sitemap();
    expect(String(second[0].lastModified)).toBe(String(first[0].lastModified));
  });

  it("excludes the routes that should never be a search result", async () => {
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

describe("sitemap — catalogue pages", () => {
  it("routes each media type to the page that actually renders it", async () => {
    listRankedEntries.mockResolvedValue({
      titles: [entry("movie-27205", "2026-08-01T10:00:00Z"), entry("tv-1396", "2026-08-02T10:00:00Z")],
      anime: [entry("16498", "2026-08-03T10:00:00Z")],
      games: [entry("1091500", "2026-08-04T10:00:00Z")],
    });
    listRankedChannels.mockResolvedValue([entry("UCX6OQ3DkcsbYNE6H8uQQuVA", "2026-08-05T10:00:00Z")]);

    const urls = (await sitemap()).map((e) => e.url);
    // /title carries the media type in its slug; the others do not.
    expect(urls).toContain(`${SITE_URL}/title/movie-27205`);
    expect(urls).toContain(`${SITE_URL}/title/tv-1396`);
    expect(urls).toContain(`${SITE_URL}/anime/16498`);
    expect(urls).toContain(`${SITE_URL}/games/1091500`);
    expect(urls).toContain(`${SITE_URL}/youtube/channel/UCX6OQ3DkcsbYNE6H8uQQuVA`);
  });

  it("dates a catalogue page from the row, not from the build", async () => {
    listRankedEntries.mockResolvedValue({
      ...NO_ENTRIES,
      games: [entry("1091500", "2026-08-04T10:00:00Z")],
    });

    const own = (await sitemap()).find((e) => e.url === `${SITE_URL}/games/1091500`);
    expect(new Date(own!.lastModified as Date).toISOString()).toBe("2026-08-04T10:00:00.000Z");
  });

  it("ranks catalogue pages above profiles but below the home page", async () => {
    listRankedEntries.mockResolvedValue({ ...NO_ENTRIES, anime: [entry("1", "2026-08-01T10:00:00Z")] });
    listPublicProfiles.mockResolvedValue([profile("anya", "2026-08-01T10:00:00Z")]);

    const all = await sitemap();
    const page = all.find((e) => e.url === `${SITE_URL}/anime/1`)!;
    const own = all.find((e) => e.url === `${SITE_URL}/u/anya`)!;
    expect(page.priority!).toBeGreaterThan(own.priority!);
    expect(page.priority!).toBeLessThan(1);
  });

  it("escapes a channel id rather than pasting it in raw", async () => {
    listRankedChannels.mockResolvedValue([entry("UC a/b", "2026-08-01T10:00:00Z")]);
    expect((await sitemap()).map((e) => e.url)).toContain(`${SITE_URL}/youtube/channel/UC%20a%2Fb`);
  });

  /**
   * Battles have no public flag: migration 006 makes the uuid itself the access
   * check. Listing them would hand every battle to anyone who opens the sitemap.
   */
  it("never lists a battle, whatever the loaders return", async () => {
    listRankedEntries.mockResolvedValue({
      ...NO_ENTRIES,
      games: [entry("1091500", "2026-08-01T10:00:00Z")],
    });

    for (const url of (await sitemap()).map((e) => e.url)) {
      expect(url).not.toContain("/battle");
    }
  });

  it("keeps the static routes when only the dynamic half fails", async () => {
    // Each loader answers with an empty list rather than throwing.
    const entries = await sitemap();
    expect(entries).toHaveLength(SITEMAP_ROUTES.length);
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
