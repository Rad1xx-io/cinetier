import { describe, expect, it } from "vitest";
import { getJson, TEST_TIMEOUT_MS, USER_AGENT, withRetry } from "./helpers";

const BASE = "https://api.jikan.moe/v4";

function jikan<T>(path: string): Promise<T> {
  return getJson<T>(`${BASE}${path}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
}

interface Anime {
  mal_id: number;
  title: string;
  title_english: string | null;
  type: string | null;
  status: string | null;
  duration: string | null;
  score: number | null;
  images?: { jpg?: { large_image_url: string | null } };
}

/**
 * The standby source, checked because a standby nobody checks is not one.
 *
 * Jikan's list endpoints were failing for days while its single-entry lookups
 * kept working, so the two are asserted separately: knowing *which half* is
 * down is the difference between switching sources and waiting it out.
 */
describe("Jikan / MyAnimeList", () => {
  it(
    "returns an entry by id, with the fields the adapter maps",
    async () => {
      const data = await withRetry("Jikan details", () =>
        jikan<{ data: Anime }>("/anime/16498/full")
      );

      const anime = data.data;
      expect(anime.mal_id).toBe(16498);
      expect(anime.title_english ?? anime.title).toBeTruthy();
      // Each of these is parsed rather than passed through — a shape change
      // here is what the adapter's mapping would silently get wrong.
      expect(typeof anime.duration).toBe("string");
      expect(anime.status).toBeTruthy();
      expect(anime.type).toBeTruthy();
      // Already 0-10, unlike AniList's 0-100. Dividing again would put every
      // score under 1.
      if (anime.score !== null) expect(anime.score).toBeLessThanOrEqual(10);
      expect(anime.images?.jpg?.large_image_url).toContain("myanimelist.net");
    },
    TEST_TIMEOUT_MS
  );

  it(
    "serves the genre list the filter maps names to ids through",
    async () => {
      const data = await withRetry("Jikan genres", () =>
        jikan<{ data: { mal_id: number; name: string }[] }>("/genres/anime")
      );

      expect(data.data.length).toBeGreaterThan(10);
      expect(data.data.some((g) => g.name === "Action")).toBe(true);
      expect(data.data.every((g) => typeof g.mal_id === "number")).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  /**
   * Search is the half that has been broken for days at a time. It is reported
   * separately and does not fail the suite, because the app does not depend on
   * it while AniList is the active source — but a silent recovery is worth
   * knowing about too.
   */
  it(
    "reports whether search is answering",
    async () => {
      let working = false;
      let detail = "";
      try {
        const data = await jikan<{ data: Anime[] }>("/anime?q=naruto&limit=3&sfw=true");
        working = data.data.length > 0;
        detail = `${data.data.length} results`;
      } catch (error) {
        detail = error instanceof Error ? error.message : String(error);
      }

      console.info(`[jikan] search ${working ? "is working" : "is NOT working"} — ${detail}`);
      // Deliberately not an assertion on `working`: this records the state, it
      // does not judge it.
      expect(typeof working).toBe("boolean");
    },
    TEST_TIMEOUT_MS
  );
});
