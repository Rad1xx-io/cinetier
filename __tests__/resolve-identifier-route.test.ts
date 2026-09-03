import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse, type NextRequest } from "next/server";

const rpc = vi.fn();
const rateLimitOrNull = vi.fn();
let supabaseConfigured = true;

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}));
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => supabaseConfigured,
  getSupabaseEnv: () => ({ url: "https://stub.supabase.co", anonKey: "stub" }),
}));
vi.mock("@/lib/rate-limit/limiter", () => ({
  rateLimitOrNull: (...args: unknown[]) => rateLimitOrNull(...args),
}));

const { POST } = await import("@/app/api/auth/resolve-identifier/route");

function jsonRequest(body: unknown): NextRequest {
  return new Request("https://tierlistonline.com/api/auth/resolve-identifier", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseConfigured = true;
  rateLimitOrNull.mockResolvedValue(null);
  rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("an already-email-shaped identifier", () => {
  it("passes it through unchanged, without spending the resolver RPC's own budget", async () => {
    const res = await POST(jsonRequest({ identifier: "reader@example.test" }));
    expect(await res.json()).toEqual({ email: "reader@example.test" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("a username", () => {
  it("resolves through resolve_username_email", async () => {
    rpc.mockResolvedValue({ data: "owner@example.test", error: null });

    const res = await POST(jsonRequest({ identifier: "someuser" }));

    expect(await res.json()).toEqual({ email: "owner@example.test" });
    expect(rpc).toHaveBeenCalledWith("resolve_username_email", { p_username: "someuser" });
  });

  it("falls back to the raw identifier when nothing resolves — the enumeration-safe path", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const res = await POST(jsonRequest({ identifier: "nobody_by_this_handle" }));

    // Not a distinct "no such user" error: signInWithPassword goes on to
    // fail the same generic way it would for a wrong password.
    expect(await res.json()).toEqual({ email: "nobody_by_this_handle" });
    expect(res.status).toBe(200);
  });

  it("does the same on an RPC error, and does not forward it to the client", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } });

    const res = await POST(jsonRequest({ identifier: "someuser" }));
    const body = await res.json();

    expect(body).toEqual({ email: "someuser" });
    expect(JSON.stringify(body)).not.toContain("connection refused");
    logged.mockRestore();
  });
});

describe("rate limiting", () => {
  it("is checked before the resolver RPC is ever called", async () => {
    rateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many requests. Please slow down and try again shortly." }, { status: 429 })
    );

    const res = await POST(jsonRequest({ identifier: "someuser" }));

    expect(res.status).toBe(429);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("counts against the auth tier, not some other one", async () => {
    await POST(jsonRequest({ identifier: "reader@example.test" }));
    expect(rateLimitOrNull).toHaveBeenCalledWith(expect.anything(), "auth");
  });

  it("is checked even for an already-email-shaped identifier — every attempt counts, not only ones that need resolving", async () => {
    await POST(jsonRequest({ identifier: "reader@example.test" }));
    expect(rateLimitOrNull).toHaveBeenCalledTimes(1);
  });
});

describe("input validation", () => {
  it("refuses an empty identifier", async () => {
    const res = await POST(jsonRequest({ identifier: "" }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses malformed JSON", async () => {
    const req = new Request("https://tierlistonline.com/api/auth/resolve-identifier", {
      method: "POST",
      body: "not json",
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("when cloud accounts are not configured", () => {
  it("refuses cleanly rather than reaching for a client that does not exist", async () => {
    supabaseConfigured = false;
    const res = await POST(jsonRequest({ identifier: "reader@example.test" }));
    expect(res.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
});
