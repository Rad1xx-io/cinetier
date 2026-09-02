import { distance } from "fastest-levenshtein";
import type { ApiErrorBody, SearchResponse, TitleSummary } from "@/lib/types";
import type { ImportRow, MatchConfidence, TmdbMatch } from "@/lib/import/types";

/**
 * Finds each imported row a TMDB match, through the exact endpoint the
 * catalogue's own search box already calls — `/api/tmdb/search` — rather
 * than a second way of asking TMDB for the same thing. That endpoint is
 * metered (the `search` rate-limit tier, 40/min anonymous, 90/min signed
 * in); a large export can easily be a thousand rows, so this has to spend
 * that budget on purpose rather than firing every request at once.
 */

/** Kept safely under half the tier's own budget, so an account still browsing the site during an import is not the thing that trips it. */
const PACING_MS = { anonymous: 1500, authenticated: 800 } as const;
const MAX_RETRY_WAIT_MS = 60_000;

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diacritics, so "Amélie" and "Amelie" compare equal
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function yearOf(releaseDate: string | null): number | null {
  if (!releaseDate) return null;
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

/** How far apart two normalized titles may be and still count as "the same title", scaled by length for the same reason a three-letter typo and a twelve-letter one are not equally suspicious. */
function titleTolerance(length: number): number {
  if (length <= 4) return 0;
  if (length <= 8) return 1;
  if (length <= 14) return 2;
  return 3;
}

interface Scored {
  result: TitleSummary;
  titleDistance: number;
  yearDelta: number | null;
}

function scoreCandidates(row: ImportRow, results: TitleSummary[]): Scored[] {
  const wanted = normalizeTitle(row.title);
  return results.map((result) => {
    const distances = [result.title, result.originalTitle]
      .filter(Boolean)
      .map((t) => distance(normalizeTitle(t), wanted));
    const titleDistance = Math.min(...distances, Number.POSITIVE_INFINITY);
    const resultYear = yearOf(result.releaseDate);
    const yearDelta =
      row.year !== null && resultYear !== null ? Math.abs(resultYear - row.year) : null;
    return { result, titleDistance, yearDelta };
  });
}

/** The best candidate, and how sure this is about it — see the module doc for what each level means in the preview. */
function pickMatch(row: ImportRow, results: TitleSummary[]): { match: TitleSummary | null; confidence: MatchConfidence } {
  if (results.length === 0) return { match: null, confidence: "not-found" };

  const scored = scoreCandidates(row, results).sort((a, b) => {
    // A year match outranks a closer title on a year mismatch — two films can
    // share a title across a remake or an anniversary re-release, and the
    // year is what actually tells them apart.
    const ay = a.yearDelta ?? Number.POSITIVE_INFINITY;
    const by = b.yearDelta ?? Number.POSITIVE_INFINITY;
    return ay - by || a.titleDistance - b.titleDistance;
  });

  const best = scored[0];
  const tolerance = titleTolerance(normalizeTitle(row.title).length);
  const titleMatches = best.titleDistance <= tolerance;
  // Null means there was nothing to compare — the source row had no year, or
  // TMDB returned none — which is an absence of evidence, not evidence
  // against a match. It must not read the same as "checked, and it's off by
  // a lot", so it is treated as agreeing rather than as the worst case.
  const yearAgrees = best.yearDelta === null || best.yearDelta === 0;

  let confidence: MatchConfidence;
  if (titleMatches && yearAgrees) confidence = "exact";
  else if (titleMatches && (best.yearDelta ?? 0) <= 1) confidence = "likely";
  else confidence = "uncertain";

  return { match: best.result, confidence };
}

async function searchMovie(title: string, signal?: AbortSignal): Promise<TitleSummary[]> {
  const url = `/api/tmdb/search?type=movie&query=${encodeURIComponent(title)}`;
  const res = await fetch(url, { signal });

  if (res.status === 429) {
    const retryAfter = Number.parseInt(res.headers.get("Retry-After") ?? "", 10);
    const wait = Number.isFinite(retryAfter) ? retryAfter * 1000 : 5000;
    await new Promise((resolve) => setTimeout(resolve, Math.min(wait, MAX_RETRY_WAIT_MS)));
    return searchMovie(title, signal); // one retry is the whole policy — see matchAgainstTmdb
  }

  const body = await res.json();
  if (!res.ok) throw new Error((body as ApiErrorBody).error ?? "TMDB search failed.");
  return (body as SearchResponse).results;
}

export interface MatchOptions {
  /** Picks which side of the search tier's anon/authenticated split to pace against. */
  authenticated: boolean;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Resolves every row in order, one request at a time.
 *
 * Sequential on purpose, not merely simple: the tier this shares with the
 * ordinary search box is metered per minute, not per request, so anything
 * concurrent here just front-loads the same budget and starts refusing
 * requests sooner. A retry on 429 is attempted once per row — if the second
 * attempt still fails, that row is left unmatched rather than retried
 * forever, since a search endpoint refusing twice in a row is more likely
 * down than one row's bad luck.
 */
export async function matchAgainstTmdb(
  rows: ImportRow[],
  options: MatchOptions
): Promise<TmdbMatch[]> {
  const pace = options.authenticated ? PACING_MS.authenticated : PACING_MS.anonymous;
  const matched: TmdbMatch[] = [];

  for (let i = 0; i < rows.length; i++) {
    if (options.signal?.aborted) break;
    const row = rows[i];

    let results: TitleSummary[] = [];
    try {
      results = await searchMovie(row.title, options.signal);
    } catch {
      // Left as "not-found" — a network hiccup on one row should not abort an
      // import that might be a thousand rows long.
    }

    const { match, confidence } = pickMatch(row, results);
    matched.push({ source: row, mediaType: "movie", match, confidence });

    options.onProgress?.(i + 1, rows.length);
    if (i < rows.length - 1) await new Promise((resolve) => setTimeout(resolve, pace));
  }

  return matched;
}
