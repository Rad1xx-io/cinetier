import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * Same regression class as sign-in-route.test.ts: the email an identifier
 * resolves to must never cross back into a response body. This route's own
 * extra property is that its response has to be identical whether or not
 * the identifier resolved to anything at all, or the send itself failed —
 * "the email never appears" and "the response never distinguishes" are both
 * checked here, since either one leaking would defeat the point.
 */

const rpc = vi.fn();
const resetPasswordForEmail = vi.fn();
const rateLimitOrNull = vi.fn();
let serverClientAvailable = true;

// resolveIdentifierEmail (lib/supabase/resolve-identifier.ts, imported by
// the route) is server-only, and that import throws outside a server
// render — stubbed rather than removed, same as rate-limiter.test.ts.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit/limiter", () => ({
  rateLimitOrNull: (...a: unknown[]) => rateLimitOrNull(...a),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () =>
    serverClientAvailable
      ? {
          rpc: (...a: unknown[]) => rpc(...a),
          auth: { resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a) },
        }
      : null,
}));

const { POST } = await import("@/app/api/auth/forgot-password/route");

// A real NextRequest, not a plain Request cast to the type — this route
// reads request.nextUrl.origin, which only a real NextRequest populates.
function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("https://tierlistonline.com/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverClientAvailable = true;
  rateLimitOrNull.mockResolvedValue(null);
  rpc.mockResolvedValue({ data: null, error: null });
  resetPasswordForEmail.mockResolvedValue({ error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("the email never appears in ANY response body", () => {
  it("when the identifier resolves to a real account", async () => {
    rpc.mockResolvedValue({ data: "owner@example.test", error: null });

    const res = await POST(jsonRequest({ identifier: "someuser" }));
    const raw = await res.text();

    expect(res.status).toBe(200);
    expect(JSON.parse(raw)).toEqual({ ok: true });
    expect(raw).not.toContain("owner@example.test");
    expect(raw).not.toContain("@");
    expect(resetPasswordForEmail).toHaveBeenCalledWith("owner@example.test", expect.anything());
  });

  it("when the identifier resolves to nothing", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const res = await POST(jsonRequest({ identifier: "nobody_by_this_handle" }));
    const raw = await res.text();

    expect(JSON.parse(raw)).toEqual({ ok: true });
    expect(raw).not.toContain("nobody_by_this_handle");
  });

  it("when resetPasswordForEmail itself fails", async () => {
    rpc.mockResolvedValue({ data: "owner@example.test", error: null });
    resetPasswordForEmail.mockResolvedValue({ error: { message: "Email rate limit exceeded" } });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(jsonRequest({ identifier: "someuser" }));
    const raw = await res.text();

    expect(JSON.parse(raw)).toEqual({ ok: true });
    expect(raw).not.toContain("owner@example.test");
    expect(raw).not.toContain("Email rate limit exceeded");
    logged.mockRestore();
  });
});

describe("responds identically regardless of whether the account exists — no enumeration signal", () => {
  it("a resolved and an unresolved identifier get the same response", async () => {
    rpc.mockResolvedValue({ data: "owner@example.test", error: null });
    const resolved = await POST(jsonRequest({ identifier: "someuser" }));

    rpc.mockResolvedValue({ data: null, error: null });
    const unresolved = await POST(jsonRequest({ identifier: "nobody_at_all" }));

    expect(resolved.status).toBe(unresolved.status);
    expect(await resolved.json()).toEqual(await unresolved.json());
  });

  it("a failed send and a successful one get the same response", async () => {
    rpc.mockResolvedValue({ data: "owner@example.test", error: null });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    resetPasswordForEmail.mockResolvedValue({ error: null });
    const succeeded = await POST(jsonRequest({ identifier: "someuser" }));

    resetPasswordForEmail.mockResolvedValue({ error: { message: "boom" } });
    const failed = await POST(jsonRequest({ identifier: "someuser" }));

    expect(succeeded.status).toBe(failed.status);
    expect(await succeeded.json()).toEqual(await failed.json());
    logged.mockRestore();
  });
});

describe("rate limiting", () => {
  it("is checked before the resolver or resetPasswordForEmail are ever called", async () => {
    rateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many requests. Please slow down and try again shortly." }, { status: 429 })
    );

    const res = await POST(jsonRequest({ identifier: "someuser" }));

    expect(res.status).toBe(429);
    expect(rpc).not.toHaveBeenCalled();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("counts against the auth tier", async () => {
    await POST(jsonRequest({ identifier: "reader@example.test" }));
    expect(rateLimitOrNull).toHaveBeenCalledWith(expect.anything(), "auth");
  });
});

describe("input validation", () => {
  it("refuses an empty identifier", async () => {
    const res = await POST(jsonRequest({ identifier: "" }));
    expect(res.status).toBe(400);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("refuses malformed JSON", async () => {
    const req = new Request("https://tierlistonline.com/api/auth/forgot-password", {
      method: "POST",
      body: "not json",
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("when cloud accounts are not configured", () => {
  it("refuses cleanly", async () => {
    serverClientAvailable = false;
    const res = await POST(jsonRequest({ identifier: "reader@example.test" }));
    expect(res.status).toBe(503);
  });
});

describe("the redirect target", () => {
  it("points through the existing /auth/callback, on the request's own origin", async () => {
    rpc.mockResolvedValue({ data: "owner@example.test", error: null });

    await POST(jsonRequest({ identifier: "someuser" }));

    const [, options] = resetPasswordForEmail.mock.calls[0] as [string, { redirectTo: string }];
    expect(options.redirectTo).toContain("https://tierlistonline.com/auth/callback");
    expect(options.redirectTo).toContain(encodeURIComponent("/auth/reset-password"));
  });
});
