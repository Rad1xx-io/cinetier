import { describe, expect, it } from "vitest";
import { getJson, TEST_TIMEOUT_MS, USER_AGENT, withRetry } from "./helpers";

const URL = "https://graphql.anilist.co";

interface Media {
  id: number;
  title: { english: string | null; romaji: string | null };
  genres?: string[];
  averageScore?: number | null;
}

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const body = await getJson<{ data?: T; errors?: { message: string }[] }>(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ query, variables }),
  });
  // GraphQL reports failure inside a 200, so getJson alone would not notice.
  if (body.errors?.length) throw new Error(`GraphQL: ${body.errors[0].message}`);
  if (!body.data) throw new Error("GraphQL returned no data");
  return body.data;
}

const SEARCH = `query($s:String){Page(page:1,perPage:5){media(search:$s,type:ANIME,sort:POPULARITY_DESC){id title{english romaji} genres averageScore}}}`;
const BY_ID = `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji} genres averageScore}}`;
const GENRES = `{GenreCollection}`;

describe("AniList", () => {
  it(
    "finds a title by its English name",
    async () => {
      const data = await withRetry("AniList search", () =>
        graphql<{ Page: { media: Media[] } }>(SEARCH, { s: "Attack on Titan" })
      );

      const media = data.Page.media;
      expect(media.length).toBeGreaterThan(0);
      expect(
        media.some((m) => (m.title.english ?? m.title.romaji ?? "").toLowerCase().includes("attack on titan"))
      ).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  /**
   * The regression that prompted this suite. AniList matches its Cyrillic
   * synonyms only in the casing it stores them in — sentence case — and every
   * lowercase Russian query silently returned nothing. A user found it.
   */
  it(
    "still matches a Cyrillic synonym in sentence case",
    async () => {
      const data = await withRetry("AniList Cyrillic search", () =>
        graphql<{ Page: { media: Media[] } }>(SEARCH, { s: "Атака титанов" })
      );

      expect(
        data.Page.media.length,
        "AniList stopped matching Cyrillic synonyms — check lib/search/normalize-query.ts"
      ).toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "returns a title by id with the fields the mapper reads",
    async () => {
      const data = await withRetry("AniList details", () =>
        graphql<{ Media: Media }>(BY_ID, { id: 16498 })
      );

      expect(data.Media.id).toBe(16498);
      expect(data.Media.title.english ?? data.Media.title.romaji).toBeTruthy();
      expect(Array.isArray(data.Media.genres)).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "serves the genre vocabulary the filter is built from",
    async () => {
      const data = await withRetry("AniList genres", () =>
        graphql<{ GenreCollection: string[] }>(GENRES)
      );

      expect(data.GenreCollection.length).toBeGreaterThan(5);
      expect(data.GenreCollection).toContain("Action");
    },
    TEST_TIMEOUT_MS
  );
});
