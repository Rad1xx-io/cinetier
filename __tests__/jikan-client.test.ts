import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module under test is server-only, which throws outside a server render.
vi.mock("server-only", () => ({}));

const { jikanFetch, MAX_ATTEMPTS, resetJikanPacing } = await import(
  "@/lib/anime-sources/jikan-client"
);
const { AnimeSourceError } = await import("@/lib/anime-sources/anime-source");

function reply(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
/** Every wait the client took, so the backoff curve can be asserted directly. */
let waits: number[];

beforeEach(() => {
  waits = [];
  // Real pacing would make this suite wait seven seconds per retry case. The
  // shape is what matters, so the clock is compressed and recorded instead.
  resetJikanPacing({
    minIntervalMs: 0,
    backoffMs: (attempt) => {
      waits.push(attempt);
      return 1;
    },
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  resetJikanPacing();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("jikanFetch — success", () => {
  it("returns the parsed body", async () => {
    fetchMock.mockResolvedValue(reply(200, { data: [{ mal_id: 1 }] }));
    await expect(jikanFetch("/anime/1")).resolves.toEqual({ data: [{ mal_id: 1 }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks the right host and caches the response", async () => {
    fetchMock.mockResolvedValue(reply(200, {}));
    await jikanFetch("/genres/anime", { revalidate: 86_400 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.jikan.moe/v4/genres/anime");
    expect(init.next).toEqual({ revalidate: 86_400 });
    expect(init.headers).toEqual({ Accept: "application/json" });
  });
});

describe("jikanFetch — rate limiting", () => {
  it("retries a 429 and succeeds on a later attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(200, { data: [] }));

    await expect(jikanFetch("/anime?q=naruto")).resolves.toEqual({ data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("backs off further after each failure", async () => {
    fetchMock.mockResolvedValueOnce(reply(429)).mockResolvedValueOnce(reply(200, {}));
    await jikanFetch("/anime");
    expect(waits).toEqual([1]);

    waits.length = 0;
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(200, {}));
    await jikanFetch("/anime");
    // Attempt 1 then attempt 2 — a growing curve, not a fixed pause.
    expect(waits).toEqual([1, 2]);
  });

  it("gives up after the attempt cap and reports 429", async () => {
    fetchMock.mockResolvedValue(reply(429));

    await expect(jikanFetch("/anime?q=naruto")).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("prefers Retry-After over its own curve", async () => {
    const slept: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", ((fn: () => void, ms?: number) => {
      slept.push(ms ?? 0);
      return realSetTimeout(fn, 0);
    }) as typeof setTimeout);

    fetchMock
      .mockResolvedValueOnce(reply(429, {}, { "retry-after": "5" }))
      .mockResolvedValueOnce(reply(200, { data: [] }));

    await expect(jikanFetch("/anime")).resolves.toEqual({ data: [] });
    // 5 seconds as instructed, rather than the 1ms the stub curve would give.
    expect(slept).toContain(5_000);
  });
});

describe("jikanFetch — upstream failure", () => {
  // Jikan answers 504 when MyAnimeList does not respond. That is the catalogue
  // being down, not a bad request, so the caller sees 503.
  it("retries a 504 and reports it as 503", async () => {
    fetchMock.mockResolvedValue(reply(504));

    await expect(jikanFetch("/anime?q=naruto")).rejects.toMatchObject({
      status: 503,
      source: "jikan",
    });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("retries a dropped connection", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(reply(200, { data: [] }));

    await expect(jikanFetch("/anime")).resolves.toEqual({ data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("raises AnimeSourceError, so routes map it without knowing the source", async () => {
    fetchMock.mockResolvedValue(reply(503));
    await expect(jikanFetch("/anime")).rejects.toBeInstanceOf(AnimeSourceError);
  });

  it("reports a body it cannot parse rather than returning undefined", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(jikanFetch("/anime")).rejects.toMatchObject({ status: 502 });
  });
});

describe("jikanFetch — not found", () => {
  it("returns null when the caller allows it", async () => {
    fetchMock.mockResolvedValue(reply(404));
    await expect(jikanFetch("/anime/999999/full", { allowNotFound: true })).resolves.toBeNull();
    // Asking again would not conjure the entry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws 404 when it does not", async () => {
    fetchMock.mockResolvedValue(reply(404));
    await expect(jikanFetch("/anime/999999")).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 400 either", async () => {
    fetchMock.mockResolvedValue(reply(400));
    await expect(jikanFetch("/anime?page=-1")).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("jikanFetch — pacing", () => {
  it("serialises calls instead of firing them together", async () => {
    let inFlight = 0;
    let peak = 0;
    fetchMock.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return reply(200, {});
    });

    await Promise.all([jikanFetch("/a"), jikanFetch("/b"), jikanFetch("/c")]);
    // Three at once is exactly the burst Jikan's 3-per-second limit punishes.
    expect(peak).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps the queue moving after a failure", async () => {
    fetchMock.mockResolvedValueOnce(reply(404)).mockResolvedValue(reply(200, { data: [] }));

    await expect(jikanFetch("/anime/1")).rejects.toMatchObject({ status: 404 });
    await expect(jikanFetch("/anime/2")).resolves.toEqual({ data: [] });
  });
});
