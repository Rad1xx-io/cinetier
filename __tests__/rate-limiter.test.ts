import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The limiter's own behaviour, above the database.
 *
 * The counting itself is Postgres' job and is checked by the self-check inside
 * migration 017 — two allowed, the third refused. What is checked here is
 * everything this module decides before and after that call: which budget a
 * tier gets, that the decision happens at all, that a refusal carries a
 * `Retry-After` and leaks nothing, and that the identity a bucket is derived
 * from cannot be set by whoever is being limited.
 */

const rpc = vi.fn();
const getUser = vi.fn();

// The limiter is server-only, and that import throws outside a server render.
// Stubbed rather than removed: the marker is doing its job in the build, and
// this suite is the one place that needs to reach past it.
vi.mock("server-only", () => ({}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}));
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseEnv: () => ({ url: "https://stub.supabase.co", anonKey: "stub" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser: () => getUser() } }),
}));

// The page gate reads the caller's address through next/headers rather than a
// Request, so the header set is the thing under test here.
let pageHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => pageHeaders }));

const { checkRateLimit, rateLimitOrNull, catalogueGate } = await import(
  "@/lib/rate-limit/limiter"
);

function request(headers: Record<string, string> = {}, url?: string): Request {
  return new Request(url ?? "https://tierlistonline.com/api/youtube/search?query=x", { headers });
}

beforeEach(() => {
  rpc.mockResolvedValue({ data: 0, error: null });
  getUser.mockResolvedValue({ data: { user: null } });
});
afterEach(() => vi.clearAllMocks());

describe("the limit is consulted before anything expensive", () => {
  it("allows a request the database says is inside its budget", async () => {
    const decision = await checkRateLimit(request({ "x-forwarded-for": "1.2.3.4" }), "search");
    expect(decision).toEqual({ allowed: true, retryAfter: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("refuses one the database says is over, and carries the wait", async () => {
    rpc.mockResolvedValue({ data: 42, error: null });
    const decision = await checkRateLimit(request({ "x-forwarded-for": "1.2.3.4" }), "search");
    expect(decision).toEqual({ allowed: false, retryAfter: 42 });
  });
});

describe("budgets are priced by what a request costs upstream", () => {
  async function limitFor(tier: Parameters<typeof checkRateLimit>[1]) {
    rpc.mockClear();
    await checkRateLimit(request({ "x-forwarded-for": "1.2.3.4" }), tier);
    return rpc.mock.calls[0][1] as { p_limit: number; p_window_seconds: number };
  }

  it("gives YouTube search the strictest budget of all", async () => {
    // 100 search.list calls is YouTube's entire day, so this one has to be the
    // tightest number in the table.
    const youtube = await limitFor("youtube-search");
    const search = await limitFor("search");
    const details = await limitFor("details");
    const reference = await limitFor("reference");

    expect(youtube.p_limit).toBeLessThan(search.p_limit);
    expect(search.p_limit).toBeLessThan(details.p_limit);
    expect(details.p_limit).toBeLessThan(reference.p_limit);
  });

  it("uses a window every tier agrees on", async () => {
    const { p_window_seconds } = await limitFor("search");
    expect(p_window_seconds).toBeGreaterThan(0);
  });
});

describe("every tier that spends something is priced", () => {
  /*
   * `/api/custom-uploads` was the one route with no limiter at all. The daily
   * cap inside `issue_upload_grant` counts uploads that succeed, so a request
   * refused for a bad magic number cost a 2 MB body read and two counting
   * queries and was charged against nothing.
   */
  it("gives uploads a stricter budget than ordinary reads", async () => {
    rpc.mockClear();
    await checkRateLimit(request({ "x-forwarded-for": "1.1.1.1" }), "upload");
    const upload = rpc.mock.calls[0][1] as { p_limit: number };

    rpc.mockClear();
    await checkRateLimit(request({ "x-forwarded-for": "1.1.1.1" }), "details");
    const details = rpc.mock.calls[0][1] as { p_limit: number };

    expect(upload.p_limit).toBeLessThan(details.p_limit);
  });

  it("separates the upload budget from every other tier", async () => {
    rpc.mockClear();
    const headers = { "x-forwarded-for": "1.1.1.1" };
    await checkRateLimit(request(headers), "upload");
    await checkRateLimit(request(headers), "report");
    const a = (rpc.mock.calls[0][1] as { p_bucket: string }).p_bucket;
    const b = (rpc.mock.calls[1][1] as { p_bucket: string }).p_bucket;
    expect(a).not.toBe(b);
  });

  /*
   * Password sign-in (migration 025's resolve_username_email, called from
   * /api/auth/sign-in and /api/auth/forgot-password) was the first
   * password-checkable flow this app had — until it existed, there was
   * nothing here for a brute-force attempt to spend against.
   */
  it("gives password sign-in a budget as tight as filing a report, not as loose as an ordinary read", async () => {
    rpc.mockClear();
    await checkRateLimit(request({ "x-forwarded-for": "1.1.1.1" }), "auth");
    const auth = rpc.mock.calls[0][1] as { p_limit: number };

    rpc.mockClear();
    await checkRateLimit(request({ "x-forwarded-for": "1.1.1.1" }), "report");
    const report = rpc.mock.calls[0][1] as { p_limit: number };

    rpc.mockClear();
    await checkRateLimit(request({ "x-forwarded-for": "1.1.1.1" }), "search");
    const search = rpc.mock.calls[0][1] as { p_limit: number };

    expect(auth.p_limit).toBeLessThanOrEqual(report.p_limit);
    expect(auth.p_limit).toBeLessThan(search.p_limit);
  });
});

describe("the bucket is derived, never accepted", () => {
  function bucketOf(call: number) {
    return (rpc.mock.calls[call][1] as { p_bucket: string }).p_bucket;
  }

  it("separates two addresses", async () => {
    await checkRateLimit(request({ "x-forwarded-for": "1.1.1.1" }), "search");
    await checkRateLimit(request({ "x-forwarded-for": "2.2.2.2" }), "search");
    expect(bucketOf(0)).not.toBe(bucketOf(1));
  });

  it("separates two tiers for the same address", async () => {
    await checkRateLimit(request({ "x-forwarded-for": "1.1.1.1" }), "search");
    await checkRateLimit(request({ "x-forwarded-for": "1.1.1.1" }), "details");
    expect(bucketOf(0)).not.toBe(bucketOf(1));
  });

  /*
   * The bypass worth checking for explicitly, because it is the obvious one to
   * try and it would be invisible in production: if the bucket keyed on
   * anything from the url, a fresh query string would mint a fresh budget and
   * the limiter would be decorative. The bucket is built from tier and identity
   * only, and these pin that.
   */
  it("is not moved by varying the query string", async () => {
    const headers = { "x-forwarded-for": "1.1.1.1" };
    await checkRateLimit(
      request(headers, "https://tierlistonline.com/api/youtube/search?query=aaaa"),
      "search"
    );
    await checkRateLimit(
      request(headers, "https://tierlistonline.com/api/youtube/search?query=bbbb&extra=1"),
      "search"
    );
    expect(bucketOf(0)).toBe(bucketOf(1));
  });

  it("is not moved by varying the page", async () => {
    const headers = { "x-forwarded-for": "1.1.1.1" };
    await checkRateLimit(
      request(headers, "https://tierlistonline.com/api/tmdb/search?query=x&page=1"),
      "search"
    );
    await checkRateLimit(
      request(headers, "https://tierlistonline.com/api/tmdb/search?query=x&page=497"),
      "search"
    );
    expect(bucketOf(0)).toBe(bucketOf(1));
  });

  it("is not moved by re-encoding the same parameters", async () => {
    const headers = { "x-forwarded-for": "1.1.1.1" };
    await checkRateLimit(
      request(headers, "https://tierlistonline.com/api/tmdb/search?query=a%20b"),
      "search"
    );
    await checkRateLimit(
      request(headers, "https://tierlistonline.com/api/tmdb/search?query=a+b"),
      "search"
    );
    expect(bucketOf(0)).toBe(bucketOf(1));
  });

  it("is not moved by the path within one tier", async () => {
    const headers = { "x-forwarded-for": "1.1.1.1" };
    await checkRateLimit(request(headers, "https://tierlistonline.com/api/tmdb/search"), "search");
    await checkRateLimit(request(headers, "https://tierlistonline.com/api/games/search"), "search");
    expect(bucketOf(0)).toBe(bucketOf(1));
  });

  it("gives the same address the same bucket twice", async () => {
    await checkRateLimit(request({ "x-forwarded-for": "1.1.1.1" }), "search");
    await checkRateLimit(request({ "x-forwarded-for": "1.1.1.1" }), "search");
    expect(bucketOf(0)).toBe(bucketOf(1));
  });

  it("takes only the first hop of x-forwarded-for", async () => {
    // The client cannot prepend a value: Vercel rewrites this header, and the
    // first entry is the real peer. Two requests claiming different upstream
    // proxies but the same client must share one budget.
    await checkRateLimit(request({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }), "search");
    await checkRateLimit(request({ "x-forwarded-for": "9.9.9.9, 172.16.0.9" }), "search");
    expect(bucketOf(0)).toBe(bucketOf(1));
  });

  it("puts no address or user id in what reaches the database", async () => {
    await checkRateLimit(request({ "x-forwarded-for": "203.0.113.7" }), "search");
    const bucket = bucketOf(0);
    expect(bucket).not.toContain("203.0.113.7");
    expect(bucket).not.toContain("ip:");
    expect(bucket).not.toContain("search");
  });

  it("still counts a request with no address at all", async () => {
    await checkRateLimit(request(), "search");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(bucketOf(0)).toBeTruthy();
  });
});

describe("authenticated traffic is distinguished, but only when it matters", () => {
  it("does not look up a session while the request is inside the anonymous budget", async () => {
    const response = await rateLimitOrNull(request({ "x-forwarded-for": "1.1.1.1" }), "search");
    expect(response).toBeNull();
    // The fast path: no session lookup, because the answer was already known.
    expect(getUser).not.toHaveBeenCalled();
  });

  it("re-counts a signed-in visitor against their own, larger budget", async () => {
    // Over the anonymous limit first, inside the authenticated one second.
    rpc.mockResolvedValueOnce({ data: 30, error: null }).mockResolvedValueOnce({ data: 0, error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const response = await rateLimitOrNull(request({ "x-forwarded-for": "1.1.1.1" }), "search");

    expect(response).toBeNull();
    expect(getUser).toHaveBeenCalled();
    const [, first] = rpc.mock.calls[0] as [string, { p_limit: number; p_bucket: string }];
    const [, second] = rpc.mock.calls[1] as [string, { p_limit: number; p_bucket: string }];
    expect(second.p_limit).toBeGreaterThan(first.p_limit);
    // A different bucket, so a busy account is not charged to its address.
    expect(second.p_bucket).not.toBe(first.p_bucket);
  });

  it("refuses an anonymous visitor who is over, without a session to fall back on", async () => {
    rpc.mockResolvedValue({ data: 17, error: null });
    const response = await rateLimitOrNull(request({ "x-forwarded-for": "1.1.1.1" }), "search");

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("17");
  });

  it("refuses a signed-in visitor who is over both budgets", async () => {
    rpc.mockResolvedValue({ data: 9, error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const response = await rateLimitOrNull(request({ "x-forwarded-for": "1.1.1.1" }), "search");
    expect(response?.status).toBe(429);
  });
});

describe("the refusal says nothing useful to an attacker", () => {
  it("names no limit, no budget and no identity", async () => {
    rpc.mockResolvedValue({ data: 30, error: null });
    const response = await rateLimitOrNull(request({ "x-forwarded-for": "1.1.1.1" }), "youtube-search");
    const body = await response!.json();

    expect(JSON.stringify(body)).not.toMatch(/\d+ ?(per|\/) ?(minute|second)/i);
    expect(JSON.stringify(body)).not.toContain("1.1.1.1");
    expect(JSON.stringify(body)).not.toContain("bucket");
    expect(Object.keys(body)).toEqual(["error"]);
  });
});

describe("a limiter that cannot answer does not take the site down with it", () => {
  it("allows the request when the database refuses, and says so loudly", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } });

    const decision = await checkRateLimit(request({ "x-forwarded-for": "1.1.1.1" }), "search");

    // Deliberate: guest-only mode has no Supabase at all, and an outage must
    // not become a total outage. The log line is what makes it noticeable.
    expect(decision.allowed).toBe(true);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("allows the request when the call throws", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockRejectedValue(new Error("socket hang up"));

    const decision = await checkRateLimit(request({ "x-forwarded-for": "1.1.1.1" }), "search");

    expect(decision.allowed).toBe(true);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("the catalogue detail pages are metered like the routes beside them", () => {
  /*
   * The gap this closes: /title/[id], /anime/[id] and /youtube/channel/[id]
   * call TMDB, AniList and YouTube during their server render, with an id
   * taken straight from the url. That is the same upstream spend as the
   * metered `/api` details routes and it comes out of the same quota, but only
   * the routes were counted — so requesting the page instead of the API made
   * the call for free. On YouTube, whose daily quota is the scarce one,
   * walking distinct channel ids could take the catalogue off the site for the
   * rest of the day without touching a metered endpoint once.
   */
  beforeEach(() => {
    pageHeaders = new Headers({ "x-forwarded-for": "9.9.9.9" });
  });

  it("lets a page render while the budget holds", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    expect(await catalogueGate("details")).toBe(false);
    expect(rpc).toHaveBeenCalled();
  });

  it("refuses the page once the budget is gone", async () => {
    rpc.mockResolvedValue({ data: 30, error: null });
    getUser.mockResolvedValue({ data: { user: null } });

    expect(await catalogueGate("details")).toBe(true);
  });

  it("counts the caller by address, not by anything they can name", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });

    await catalogueGate("details");
    const first = rpc.mock.calls.at(-1)?.[1].p_bucket;

    pageHeaders = new Headers({ "x-forwarded-for": "8.8.8.8" });
    await catalogueGate("details");
    const second = rpc.mock.calls.at(-1)?.[1].p_bucket;

    expect(first).not.toEqual(second);
    // And the bucket is opaque: the address must not survive into the table.
    expect(String(first)).not.toContain("9.9.9.9");
  });

  it("still refuses when the address cannot be read at all", async () => {
    // Everyone in that situation shares one bucket, which fails toward
    // limiting rather than away from it.
    pageHeaders = new Headers();
    rpc.mockResolvedValue({ data: 12, error: null });
    getUser.mockResolvedValue({ data: { user: null } });

    expect(await catalogueGate("details")).toBe(true);
  });

  it("does not take the catalogue down when the limiter cannot be consulted", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } });

    expect(await catalogueGate("details")).toBe(false);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
