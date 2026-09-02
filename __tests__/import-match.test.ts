import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matchAgainstTmdb } from "@/lib/import/match";
import type { ImportRow } from "@/lib/import/types";
import type { SearchResponse, TitleSummary } from "@/lib/types";

function title(over: Partial<TitleSummary> = {}): TitleSummary {
  return {
    tmdbId: 1,
    mediaType: "movie",
    title: "Heat",
    originalTitle: "Heat",
    posterPath: "/poster.jpg",
    backdropPath: null,
    releaseDate: "1995-12-15",
    overview: "",
    voteAverage: 7.7,
    genreIds: [],
    ...over,
  };
}

function row(over: Partial<ImportRow> = {}): ImportRow {
  return { title: "Heat", year: 1995, rating: 4.5, sourceUrl: null, ...over };
}

function searchResponse(results: TitleSummary[]): SearchResponse {
  return { page: 1, totalPages: 1, totalResults: results.length, results };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return {
    status: init.status ?? 200,
    ok: (init.status ?? 200) < 400,
    headers: { get: (key: string) => init.headers?.[key] ?? null },
    json: async () => body,
  };
}

describe("matchAgainstTmdb — confidence", () => {
  it("is 'exact' for a matching title and an exact year", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(searchResponse([title()])));

    const [result] = await matchAgainstTmdb([row()], { authenticated: true });

    expect(result.confidence).toBe("exact");
    expect(result.match?.tmdbId).toBe(1);
  });

  it("is 'likely' for a matching title one year off — a common festival/wide-release gap", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(searchResponse([title({ releaseDate: "1996-01-10" })]))
    );

    const [result] = await matchAgainstTmdb([row({ year: 1995 })], { authenticated: true });

    expect(result.confidence).toBe("likely");
  });

  it("prefers a candidate whose year matches over a closer title spelling with the wrong year — a remake case", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        searchResponse([
          title({ tmdbId: 2, title: "Heat", releaseDate: "2015-01-01" }), // exact spelling, wrong decade
          title({ tmdbId: 1, title: "Heat", releaseDate: "1995-12-15" }), // the actual film being imported
        ])
      )
    );

    const [result] = await matchAgainstTmdb([row({ year: 1995 })], { authenticated: true });

    expect(result.match?.tmdbId).toBe(1);
    expect(result.confidence).toBe("exact");
  });

  it("is 'uncertain' when nothing found matches the year closely, but a candidate exists", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(searchResponse([title({ releaseDate: "1960-01-01" })]))
    );

    const [result] = await matchAgainstTmdb([row({ year: 1995 })], { authenticated: true });

    expect(result.confidence).toBe("uncertain");
    expect(result.match).not.toBeNull();
  });

  it("is 'not-found' when TMDB returns nothing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(searchResponse([])));

    const [result] = await matchAgainstTmdb([row()], { authenticated: true });

    expect(result.confidence).toBe("not-found");
    expect(result.match).toBeNull();
  });

  it("does not gate on the year when the source row has none", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(searchResponse([title()])));

    const [result] = await matchAgainstTmdb([row({ year: null })], { authenticated: true });

    expect(result.confidence).toBe("exact");
  });
});

describe("matchAgainstTmdb — the shared rate limit", () => {
  it("makes one request at a time, in order, not all at once", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchResponse([])));

    await matchAgainstTmdb(
      [row({ title: "A" }), row({ title: "B" }), row({ title: "C" })],
      { authenticated: true }
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toContain("query=A");
    expect(fetchMock.mock.calls[1][0]).toContain("query=B");
    expect(fetchMock.mock.calls[2][0]).toContain("query=C");
  });

  it("waits for Retry-After on a 429 and then retries the same row", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(jsonResponse(searchResponse([title()])));

    const promise = matchAgainstTmdb([row()], { authenticated: true });
    await vi.advanceTimersByTimeAsync(2000);
    const [result] = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.match?.tmdbId).toBe(1);
    vi.useRealTimers();
  });

  it("reports progress after every row", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchResponse([])));
    const onProgress = vi.fn();

    await matchAgainstTmdb([row(), row()], { authenticated: true, onProgress });

    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it("stops early when the signal is already aborted", async () => {
    fetchMock.mockResolvedValue(jsonResponse(searchResponse([])));
    const controller = new AbortController();
    controller.abort();

    const result = await matchAgainstTmdb([row(), row()], {
      authenticated: true,
      signal: controller.signal,
    });

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a row unmatched on a network failure rather than aborting the whole import", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const [result] = await matchAgainstTmdb([row()], { authenticated: true });

    expect(result.confidence).toBe("not-found");
  });
});
