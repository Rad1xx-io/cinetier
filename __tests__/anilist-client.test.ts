import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module under test is server-only, which throws outside a server render.
vi.mock("server-only", () => ({}));
// unstable_cache needs Next's request storage, which no unit test has. The
// wrapper is exercised through the uncached function it calls.
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));

const { anilistFetchUncached, AniListError } = await import("@/lib/anilist/client");

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("anilistFetchUncached — the request", () => {
  it("returns the data envelope's contents", async () => {
    fetchMock.mockResolvedValue(reply(200, { data: { Page: { media: [] } } }));
    await expect(anilistFetchUncached("query {}")).resolves.toEqual({ Page: { media: [] } });
  });

  it("posts the query and variables together", async () => {
    fetchMock.mockResolvedValue(reply(200, { data: {} }));
    await anilistFetchUncached("query($s:String){}", { s: "naruto" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graphql.anilist.co");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      query: "query($s:String){}",
      variables: { s: "naruto" },
    });
  });

  /**
   * The point of the whole arrangement. Next's Data Cache stores any response
   * that came back 200, and a GraphQL failure is one of those — so the request
   * itself must not be cacheable, and the result is cached a layer up only when
   * it resolves.
   */
  it("asks for no caching at the fetch layer", async () => {
    fetchMock.mockResolvedValue(reply(200, { data: {} }));
    await anilistFetchUncached("query {}");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });
});

describe("anilistFetchUncached — failure arriving as 200", () => {
  it("throws on a GraphQL error, so nothing is cached", async () => {
    fetchMock.mockResolvedValue(reply(200, { errors: [{ message: "Too Many Requests" }] }));

    await expect(anilistFetchUncached("query {}")).rejects.toThrow("Too Many Requests");
    await expect(anilistFetchUncached("query {}")).rejects.toBeInstanceOf(AniListError);
  });

  it("throws on a 200 with neither data nor errors", async () => {
    fetchMock.mockResolvedValue(reply(200, {}));
    await expect(anilistFetchUncached("query {}")).rejects.toMatchObject({ status: 502 });
  });

  it("names the first error when several arrive", async () => {
    fetchMock.mockResolvedValue(
      reply(200, { errors: [{ message: "first" }, { message: "second" }] })
    );
    await expect(anilistFetchUncached("query {}")).rejects.toThrow("first");
  });

  it("survives an error entry with no message", async () => {
    fetchMock.mockResolvedValue(reply(200, { errors: [{}] }));
    await expect(anilistFetchUncached("query {}")).rejects.toThrow("AniList GraphQL error.");
  });
});

describe("anilistFetchUncached — transport failure", () => {
  it("reports a rate limit as 429", async () => {
    fetchMock.mockResolvedValue(reply(429, {}));
    await expect(anilistFetchUncached("query {}")).rejects.toMatchObject({ status: 429 });
  });

  it("passes any other status through", async () => {
    fetchMock.mockResolvedValue(reply(403, {}));
    await expect(anilistFetchUncached("query {}")).rejects.toMatchObject({ status: 403 });
  });

  it("reports an unreachable host as 502", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(anilistFetchUncached("query {}")).rejects.toMatchObject({ status: 502 });
  });
});
