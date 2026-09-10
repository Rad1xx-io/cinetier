import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The 2026-09-08 AniList outage answered every request with 403 — a real
 * self-disable, not a bug on this end — and it left nothing in the logs,
 * because the routes only logged at `status >= 500`. These pin the fix:
 * every source failure is logged regardless of its status, and a genuine
 * source failure (rather than a bug here) says so to the caller instead of
 * a bare "could not load".
 */

const rateLimitOrNull = vi.fn();
const getGenres = vi.fn();
const search = vi.fn();
const getDetails = vi.fn();

// `lib/anime-sources` (and everything it pulls in) is server-only, and that
// import throws outside a server render — stubbed rather than removed, same
// as sign-in-route.test.ts.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit/limiter", () => ({
  rateLimitOrNull: (...a: unknown[]) => rateLimitOrNull(...a),
}));
vi.mock("@/lib/anime-sources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/anime-sources")>()),
  getAnimeSource: () => ({ getGenres, search, getDetails }),
}));

const { AnimeSourceError } = await import("@/lib/anime-sources");
const { GET: genresGET } = await import("@/app/api/anime/genres/route");
const { GET: searchGET } = await import("@/app/api/anime/search/route");
const { GET: detailsGET } = await import("@/app/api/anime/details/route");

function req(url: string): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitOrNull.mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/anime/genres", () => {
  it("logs and says the source is unavailable on a self-disable-shaped failure (the 403 AniList actually sent)", async () => {
    getGenres.mockRejectedValue(new AnimeSourceError("AniList request failed (403).", 403, "anilist"));

    const res = await genresGET(req("https://tierlistonline.com/api/anime/genres"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("The anime catalogue's data source is unavailable right now. Please try again later.");
    expect(console.error).toHaveBeenCalledWith("[anime/genres]", expect.any(AnimeSourceError));
  });

  it("still logs, and still passes the upstream's own wording through, for the two states with actionable text", async () => {
    getGenres.mockRejectedValue(new AnimeSourceError("AniList rate limit exceeded. Please try again shortly.", 429, "anilist"));

    const res = await genresGET(req("https://tierlistonline.com/api/anime/genres"));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toBe("AniList rate limit exceeded. Please try again shortly.");
    expect(console.error).toHaveBeenCalledWith("[anime/genres]", expect.any(AnimeSourceError));
  });

  it("keeps the generic message, and still logs, for a bug on this end rather than a source failure", async () => {
    getGenres.mockRejectedValue(new TypeError("Cannot read properties of undefined"));

    const res = await genresGET(req("https://tierlistonline.com/api/anime/genres"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Could not load the genre list.");
    expect(console.error).toHaveBeenCalledWith("[anime/genres]", expect.any(TypeError));
  });
});

describe("GET /api/anime/search", () => {
  it("logs and says the source is unavailable on a self-disable-shaped failure", async () => {
    search.mockRejectedValue(new AnimeSourceError("AniList request failed (403).", 403, "anilist"));

    const res = await searchGET(req("https://tierlistonline.com/api/anime/search?query=one+piece"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("The anime catalogue's data source is unavailable right now. Please try again later.");
    expect(console.error).toHaveBeenCalledWith("[anime/search]", expect.any(AnimeSourceError));
  });

  it("keeps the generic message for a bug on this end", async () => {
    search.mockRejectedValue(new Error("boom"));

    const res = await searchGET(req("https://tierlistonline.com/api/anime/search?query=one+piece"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Could not load anime. Please try again.");
    expect(console.error).toHaveBeenCalledWith("[anime/search]", expect.any(Error));
  });
});

describe("GET /api/anime/details", () => {
  it("logs and says the source is unavailable on a self-disable-shaped failure", async () => {
    getDetails.mockRejectedValue(new AnimeSourceError("AniList request failed (403).", 403, "anilist"));

    const res = await detailsGET(req("https://tierlistonline.com/api/anime/details?id=16498"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("The anime catalogue's data source is unavailable right now. Please try again later.");
    expect(console.error).toHaveBeenCalledWith("[anime/details]", expect.any(AnimeSourceError));
  });

  it("a genuine 404 (nothing to fetch) is still answered without logging — that path never swallowed an incident", async () => {
    getDetails.mockRejectedValue(new AnimeSourceError("Not found on MyAnimeList.", 404, "jikan"));

    const res = await detailsGET(req("https://tierlistonline.com/api/anime/details?id=9999999"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Anime not found.");
    expect(console.error).not.toHaveBeenCalled();
  });
});
