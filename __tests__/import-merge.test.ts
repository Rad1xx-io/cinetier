import { describe, expect, it } from "vitest";
import { buildImportPlan, buildPreviewRows } from "@/lib/import/merge";
import { LETTERBOXD_TIER_MAP } from "@/lib/import/tier-mapping";
import type { MatchedRow, TmdbMatch } from "@/lib/import/types";
import type { RankedTitle, TitleSummary } from "@/lib/types";

function titleSummary(over: Partial<TitleSummary> = {}): TitleSummary {
  return {
    tmdbId: 1,
    mediaType: "movie",
    title: "Heat",
    originalTitle: "Heat",
    posterPath: "/p.jpg",
    backdropPath: null,
    releaseDate: "1995-12-15",
    overview: "",
    voteAverage: 7.7,
    genreIds: [],
    ...over,
  };
}

function tmdbMatch(over: Partial<TmdbMatch> = {}): TmdbMatch {
  return {
    source: { title: "Heat", year: 1995, rating: 4.5, sourceUrl: null },
    mediaType: "movie",
    match: titleSummary(),
    confidence: "exact",
    ...over,
  };
}

function rankedTitle(over: Partial<RankedTitle> = {}): RankedTitle {
  return {
    tmdbId: 1,
    mediaType: "movie",
    title: "Heat",
    posterPath: "/p.jpg",
    releaseDate: "1995-12-15",
    tier: "B",
    order: 0,
    addedAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("buildPreviewRows", () => {
  it("maps the source rating to a tier using the scale it's given", () => {
    const [row] = buildPreviewRows([tmdbMatch({ source: { title: "Heat", year: 1995, rating: 4.5, sourceUrl: null } })], [], LETTERBOXD_TIER_MAP);
    expect(row.tier).toBe("S");
  });

  it("flags a match that is already in the account's list", () => {
    const [row] = buildPreviewRows(
      [tmdbMatch()],
      [rankedTitle({ tmdbId: 1, mediaType: "movie" })],
      LETTERBOXD_TIER_MAP
    );
    expect(row.alreadyRanked).toBe(true);
  });

  it("does not flag a title ranked under a different mediaType as the same entry", () => {
    const [row] = buildPreviewRows(
      [tmdbMatch()],
      [rankedTitle({ tmdbId: 1, mediaType: "tv" })],
      LETTERBOXD_TIER_MAP
    );
    expect(row.alreadyRanked).toBe(false);
  });

  it("does not flag an unmatched row as already ranked", () => {
    const [row] = buildPreviewRows(
      [tmdbMatch({ match: null, confidence: "not-found" })],
      [rankedTitle()],
      LETTERBOXD_TIER_MAP
    );
    expect(row.alreadyRanked).toBe(false);
  });
});

function matchedRow(over: Partial<MatchedRow> = {}): MatchedRow {
  return { ...tmdbMatch(), tier: "S", alreadyRanked: false, ...over };
}

describe("buildImportPlan", () => {
  it("writes a confirmed, matched row into the account's list", () => {
    const plan = buildImportPlan([matchedRow()], []);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ tmdbId: 1, mediaType: "movie", tier: "S" });
    expect(plan.added).toBe(1);
  });

  it("never writes an unmatched row, confirmed or not", () => {
    const plan = buildImportPlan([matchedRow({ match: null, confidence: "not-found" })], []);
    expect(plan.items).toHaveLength(0);
    expect(plan.added).toBe(0);
  });

  it("skips a duplicate rather than overwriting the account's existing tier for it", () => {
    const existing = rankedTitle({ tier: "C" });
    const plan = buildImportPlan([matchedRow({ tier: "S", alreadyRanked: true })], [existing]);

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].tier).toBe("C"); // unchanged — S from the import did not win
    expect(plan.added).toBe(0);
    expect(plan.skippedDuplicates).toBe(1);
  });

  it("keeps the account's other titles untouched alongside the import", () => {
    const other = rankedTitle({ tmdbId: 99, title: "Other film" });
    const plan = buildImportPlan([matchedRow()], [other]);

    expect(plan.items).toHaveLength(2);
    expect(plan.items.some((t) => t.tmdbId === 99)).toBe(true);
  });

  it("reports the account's first title ever, computed before the write — the addTitle() convention", () => {
    const plan = buildImportPlan([matchedRow()], []);
    expect(plan.isFirstTitleEver).toBe(true);
  });

  it("does not report 'first ever' once the account already has something ranked", () => {
    const plan = buildImportPlan([matchedRow()], [rankedTitle({ tmdbId: 99 })]);
    expect(plan.isFirstTitleEver).toBe(false);
  });

  it("reports the account's first film specifically, independent of 'first ever'", () => {
    // Already has an anime ranked, but never a film — the funnel's
    // trackListCreationStarted("movie") case.
    const plan = buildImportPlan([matchedRow()], [rankedTitle({ tmdbId: 99, mediaType: "anime" })]);
    expect(plan.isFirstTitleEver).toBe(false);
    expect(plan.startsMovieCatalog).toBe(true);
  });

  it("does not report 'starts the film catalogue' once a film is already ranked", () => {
    const plan = buildImportPlan([matchedRow()], [rankedTitle({ tmdbId: 99, mediaType: "movie" })]);
    expect(plan.startsMovieCatalog).toBe(false);
  });

  it("stays 'first ever'/'starts the catalogue' correctly for an import that is entirely duplicates", () => {
    // An edge worth being explicit about: if every row in the import already
    // exists, nothing is actually added, so this must not have reported
    // "first ever" if the account secretly already had these titles.
    const existing = rankedTitle();
    const plan = buildImportPlan([matchedRow({ alreadyRanked: true })], [existing]);

    expect(plan.added).toBe(0);
    expect(plan.isFirstTitleEver).toBe(false);
  });
});
