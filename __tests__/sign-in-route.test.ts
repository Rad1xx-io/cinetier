import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse, type NextRequest } from "next/server";

/**
 * The regression suite for the PII leak this route replaces
 * `/api/auth/resolve-identifier` to close: that route resolved a username
 * to its account's real email and handed the email straight back in its
 * JSON response, reachable by anyone, for any username — private profile
 * or not. Every test in "the email never appears in ANY response body"
 * below reads the RAW response text, not the parsed JSON, specifically so
 * a field this test doesn't already know to check for cannot hide the
 * email either.
 */

const rpc = vi.fn();
const signInWithPassword = vi.fn();
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
          auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a) },
        }
      : null,
}));

const { POST } = await import("@/app/api/auth/sign-in/route");

function jsonRequest(body: unknown): NextRequest {
  return new Request("https://tierlistonline.com/api/auth/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  serverClientAvailable = true;
  rateLimitOrNull.mockResolvedValue(null);
  rpc.mockResolvedValue({ data: null, error: null });
  signInWithPassword.mockResolvedValue({ error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("a successful sign-in", () => {
  it("resolves a username, signs in with the resolved email, and answers with a bare ok", async () => {
    rpc.mockResolvedValue({ data: "owner@example.test", error: null });

    const res = await POST(jsonRequest({ identifier: "someuser", password: "hunter22" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("resolve_username_email", { p_username: "someuser" });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.test",
      password: "hunter22",
    });
  });

  it("signs in directly with an already-email-shaped identifier, without calling the resolver", async () => {
    const res = await POST(jsonRequest({ identifier: "reader@example.test", password: "hunter22" }));

    expect(res.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "reader@example.test",
      password: "hunter22",
    });
  });
});

describe("the email never appears in ANY response body — the regression this route exists to close", () => {
  it("on a successful sign-in", async () => {
    rpc.mockResolvedValue({ data: "owner@example.test", error: null });

    const res = await POST(jsonRequest({ identifier: "someuser", password: "hunter22" }));
    const raw = await res.text();

    expect(raw).not.toContain("owner@example.test");
    expect(raw).not.toContain("@"); // {"ok":true} has none at all
  });

  it("on a wrong password against a resolved account", async () => {
    rpc.mockResolvedValue({ data: "owner@example.test", error: null });
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });

    const res = await POST(jsonRequest({ identifier: "someuser", password: "wrong" }));
    const raw = await res.text();

    expect(res.status).toBe(401);
    expect(raw).not.toContain("owner@example.test");
    expect(raw).not.toContain("@example.test");
  });

  it("on a username that resolves to nothing", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });

    const res = await POST(jsonRequest({ identifier: "nobody_by_this_handle", password: "whatever" }));
    const raw = await res.text();

    expect(res.status).toBe(401);
    expect(raw).not.toContain("nobody_by_this_handle");
    expect(raw).not.toContain("@");
  });
});

describe("enumeration safety: a wrong password and an unresolved identifier are indistinguishable", () => {
  it("produce the identical response shape and status", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });

    rpc.mockResolvedValue({ data: "owner@example.test", error: null });
    const wrongPassword = await POST(jsonRequest({ identifier: "someuser", password: "wrong" }));
    const wrongPasswordBody = await wrongPassword.json();

    rpc.mockResolvedValue({ data: null, error: null });
    const noSuchAccount = await POST(jsonRequest({ identifier: "nobody_at_all", password: "wrong" }));
    const noSuchAccountBody = await noSuchAccount.json();

    expect(wrongPassword.status).toBe(noSuchAccount.status);
    expect(wrongPasswordBody).toEqual(noSuchAccountBody);
  });
});

describe("rate limiting", () => {
  it("is checked before the resolver or signInWithPassword are ever called", async () => {
    rateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many requests. Please slow down and try again shortly." }, { status: 429 })
    );

    const res = await POST(jsonRequest({ identifier: "someuser", password: "hunter22" }));

    expect(res.status).toBe(429);
    expect(rpc).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("counts against the auth tier", async () => {
    await POST(jsonRequest({ identifier: "reader@example.test", password: "hunter22" }));
    expect(rateLimitOrNull).toHaveBeenCalledWith(expect.anything(), "auth");
  });
});

describe("input validation", () => {
  it("refuses a missing password", async () => {
    const res = await POST(jsonRequest({ identifier: "someuser" }));
    expect(res.status).toBe(400);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("refuses a missing identifier", async () => {
    const res = await POST(jsonRequest({ password: "hunter22" }));
    expect(res.status).toBe(400);
  });

  it("refuses malformed JSON", async () => {
    const req = new Request("https://tierlistonline.com/api/auth/sign-in", {
      method: "POST",
      body: "not json",
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("when cloud accounts are not configured", () => {
  it("refuses cleanly rather than reaching for a client that does not exist", async () => {
    serverClientAvailable = false;
    const res = await POST(jsonRequest({ identifier: "reader@example.test", password: "hunter22" }));
    expect(res.status).toBe(503);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
