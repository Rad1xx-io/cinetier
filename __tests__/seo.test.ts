import { describe, expect, it } from "vitest";
import { absoluteUrl, CRAWLER_DISALLOW, SITE_URL, SITEMAP_ROUTES } from "@/lib/seo/site";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

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

describe("sitemap", () => {
  const entries = sitemap();

  it("offers every declared route, and only those", () => {
    expect(entries.map((e) => e.url)).toEqual(SITEMAP_ROUTES.map((r) => absoluteUrl(r.path)));
  });

  it("names the paths this app actually serves", () => {
    const paths = SITEMAP_ROUTES.map((r) => r.path);
    // Films live at /discover; /movies has never been a route here.
    expect(paths).toContain("/discover");
    expect(paths).not.toContain("/movies");
    expect(paths).toEqual(expect.arrayContaining(["/", "/feed", "/anime", "/games", "/youtube"]));
  });

  it("keeps every URL absolute — a crawler has no base to resolve against", () => {
    for (const entry of entries) {
      expect(entry.url.startsWith("https://")).toBe(true);
    }
  });

  it("ranks the home page above the rest", () => {
    const home = entries.find((e) => e.url === absoluteUrl("/"));
    expect(home?.priority).toBe(1);
    for (const entry of entries) {
      expect(entry.priority ?? 0).toBeLessThanOrEqual(home?.priority ?? 0);
    }
  });

  it("keeps priorities inside the range the spec allows", () => {
    for (const entry of entries) {
      expect(entry.priority ?? 0).toBeGreaterThan(0);
      expect(entry.priority ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it("stamps one build time across every entry rather than a fresh one each", () => {
    const stamps = new Set(entries.map((e) => String(e.lastModified)));
    expect(stamps.size).toBe(1);
    // Re-invoking must not move it: a sitemap that claims every page changed on
    // every crawl teaches the crawler to ignore the field.
    expect(String(sitemap()[0].lastModified)).toBe(String(entries[0].lastModified));
  });

  it("excludes the routes that should never be a search result", () => {
    const urls = entries.map((e) => e.url).join(" ");
    for (const path of ["/settings", "/profile", "/widgets", "/battle", "/api"]) {
      expect(urls).not.toContain(path);
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

  it("points at the sitemap by absolute URL", () => {
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("agrees with the sitemap about which host this is", () => {
    expect(result.host).toBe(SITE_URL);
    expect(String(result.sitemap).startsWith(String(result.host))).toBe(true);
  });
});
