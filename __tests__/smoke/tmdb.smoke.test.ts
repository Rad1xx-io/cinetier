import { describe, expect, it } from "vitest";
import { getJson, hasEnv, TEST_TIMEOUT_MS, withRetry } from "./helpers";

const BASE = "https://api.themoviedb.org/3";
const configured = hasEnv("TMDB_API_TOKEN");

function tmdb<T>(path: string): Promise<T> {
  return getJson<T>(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
      accept: "application/json",
    },
  });
}

interface SearchResponse {
  results: { id: number; title?: string; name?: string; media_type?: string }[];
}

// Skipped rather than failed without a key: a contributor who has not set one
// should not see a red suite for a catalogue they cannot reach.
describe.skipIf(!configured)("TMDB", () => {
  it(
    "finds a film by title",
    async () => {
      const data = await withRetry("TMDB search", () =>
        tmdb<SearchResponse>("/search/multi?query=Inception&language=en-US")
      );

      expect(data.results.length).toBeGreaterThan(0);
      expect(data.results.some((r) => (r.title ?? r.name) === "Inception")).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  /**
   * The catalogue answers in English now. A silent switch back would leave the
   * interface in one language and its contents in another, which is exactly
   * the state this app spent a release getting out of.
   */
  it(
    "answers in English",
    async () => {
      const data = await withRetry("TMDB details", () =>
        tmdb<{ id: number; title: string; overview: string; genres: { id: number; name: string }[] }>(
          "/movie/27205?language=en-US"
        )
      );

      expect(data.id).toBe(27205);
      expect(data.title).toBe("Inception");
      expect(data.overview.length).toBeGreaterThan(20);
      expect(data.title, "TMDB returned a non-Latin title for en-US").toMatch(/^[\x20-\x7E]+$/);
    },
    TEST_TIMEOUT_MS
  );

  /**
   * Film and series genre ids do not line up, and lib/tmdb/genres.ts bridges
   * them by name — "Action & Adventure" on the series side covers "Action" and
   * "Adventure" on the film side. If those names move, the genre filter starts
   * dropping one media type without saying so.
   */
  it(
    "keeps the genre names the film/series bridge is keyed on",
    async () => {
      const [movie, tv] = await Promise.all([
        withRetry("TMDB movie genres", () =>
          tmdb<{ genres: { name: string }[] }>("/genre/movie/list?language=en-US")
        ),
        withRetry("TMDB tv genres", () =>
          tmdb<{ genres: { name: string }[] }>("/genre/tv/list?language=en-US")
        ),
      ]);

      const movieNames = movie.genres.map((g) => g.name);
      const tvNames = tv.genres.map((g) => g.name);

      expect(movieNames).toEqual(expect.arrayContaining(["Action", "Adventure", "Science Fiction", "Fantasy", "War"]));
      expect(tvNames).toEqual(expect.arrayContaining(["Action & Adventure", "Sci-Fi & Fantasy", "War & Politics"]));
    },
    TEST_TIMEOUT_MS
  );
});

describe.skipIf(configured)("TMDB (skipped)", () => {
  it("needs TMDB_API_TOKEN to run", () => {
    expect(configured).toBe(false);
  });
});
