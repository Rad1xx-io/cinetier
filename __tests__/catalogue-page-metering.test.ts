import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Every dynamic page that spends catalogue quota must be metered.
 *
 * The limiter used to live only in the `/api` route handlers. But the detail
 * pages call TMDB, AniList and YouTube themselves during their server render,
 * with an id taken straight from the url — the same upstream call, out of the
 * same quota, reached without touching a metered endpoint. Because the id is
 * the cache key, distinct ids miss the cache every time, so walking them was
 * an unmetered way to drain the budget the routes were protecting.
 *
 * This is written as an invariant over the tree rather than as three
 * assertions, because the failure mode is a *fourth* detail page being added
 * later by someone who has no reason to know any of the above.
 */

const APP = join(process.cwd(), "app");

/** The modules that cost somebody else's quota when called. */
const CATALOGUE_CLIENTS = [
  "@/lib/youtube/client",
  "@/lib/tmdb/client",
  "@/lib/anime-sources",
  "@/lib/tmdb/watch-providers",
];

function pageFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...pageFiles(full));
    else if (entry.name === "page.tsx") found.push(full);
  }
  return found;
}

/** A page whose url carries a segment the visitor chooses. */
function isDynamic(file: string): boolean {
  return relative(APP, file).split(sep).some((part) => part.startsWith("["));
}

function spendsQuota(source: string): boolean {
  return CATALOGUE_CLIENTS.some((mod) => source.includes(`from "${mod}`));
}

const dynamicCataloguePages = pageFiles(APP)
  .filter(isDynamic)
  .map((file) => ({ file, source: readFileSync(file, "utf8") }))
  .filter(({ source }) => spendsQuota(source));

describe("dynamic catalogue pages are metered", () => {
  it("finds the pages this invariant is about", () => {
    // If this drops to zero the rest of the suite passes vacuously, which
    // would be the worst possible way for it to fail.
    expect(dynamicCataloguePages.length).toBeGreaterThanOrEqual(3);
  });

  it.each(dynamicCataloguePages.map(({ file }) => relative(process.cwd(), file)))(
    "%s asks the limiter before it spends anything",
    (relativePath) => {
      const { source } = dynamicCataloguePages.find(
        ({ file }) => relative(process.cwd(), file) === relativePath
      )!;

      expect(source).toContain("catalogueGate");

      // Ordering is the whole point: a limiter consulted after the upstream
      // call has already paid for the request it was meant to refuse.
      const gate = source.indexOf("catalogueGate(");
      const firstSpend = Math.min(
        ...["youtubeFetch(", "tmdbFetch(", "getWatchProviders(", "getAnimeSource("]
          .map((call) => source.indexOf(call))
          .filter((at) => at >= 0)
      );
      expect(gate).toBeGreaterThan(-1);
      expect(gate).toBeLessThan(firstSpend);
    }
  );

  it.each(dynamicCataloguePages.map(({ file }) => relative(process.cwd(), file)))(
    "%s loads once per render, so the meter is not charged twice",
    (relativePath) => {
      const { source } = dynamicCataloguePages.find(
        ({ file }) => relative(process.cwd(), file) === relativePath
      )!;

      // `generateMetadata` and the component both load the same data. Without
      // React's per-request memoisation that is two gate calls for one page
      // view, which would silently halve every budget.
      expect(source).toContain('from "react"');
      expect(source).toMatch(/=\s*cache\(async/);
    }
  );
});
