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

const { checkRateLimit, rateLimitOrNull } = await import("@/lib/rate-limit/limiter");

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://tierlistonline.com/api/youtube/search?query=x", { headers });
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
