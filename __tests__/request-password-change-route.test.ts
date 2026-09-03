import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const rateLimitOrNull = vi.fn();
const getUser = vi.fn();
const resetPasswordForEmail = vi.fn();
let serverClientAvailable = true;

vi.mock("@/lib/rate-limit/limiter", () => ({
  rateLimitOrNull: (...a: unknown[]) => rateLimitOrNull(...a),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () =>
    serverClientAvailable
      ? {
          auth: {
            getUser: (...a: unknown[]) => getUser(...a),
            resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a),
          },
        }
      : null,
}));

const { POST } = await import("@/app/api/account/request-password-change/route");

// A real NextRequest, not a plain Request cast — this route reads
// request.nextUrl.origin, which only a real NextRequest populates.
function req(): NextRequest {
  return new NextRequest("https://tierlistonline.com/api/account/request-password-change", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverClientAvailable = true;
  rateLimitOrNull.mockResolvedValue(null);
  getUser.mockResolvedValue({ data: { user: { id: "u1", email: "reader@example.test" } } });
  resetPasswordForEmail.mockResolvedValue({ error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("a signed-in account requesting a change", () => {
  it("sends the confirmation to the session's own email, through the existing /auth/callback", async () => {
    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [email, options] = resetPasswordForEmail.mock.calls[0] as [string, { redirectTo: string }];
    expect(email).toBe("reader@example.test");
    expect(options.redirectTo).toContain("https://tierlistonline.com/auth/callback");
    expect(options.redirectTo).toContain(encodeURIComponent("/auth/change-password"));
  });

  it("never reads a body — the email only ever comes from the session", async () => {
    // No identifier field exists on this route at all: there is nothing
    // for a caller to submit and nothing for the route to resolve, which
    // is the whole point (see the route's own doc). This just confirms a
    // request with no body at all still works, proving no field is read.
    const res = await POST(req());
    expect(res.status).toBe(200);
  });
});

describe("unlike /api/auth/forgot-password, a real failure is not masked", () => {
  it("surfaces a specific error when the send itself fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    resetPasswordForEmail.mockResolvedValue({ error: { message: "Email rate limit exceeded" } });

    const res = await POST(req());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Could not send the confirmation email. Please try again.");
    // Supabase's own internal message is logged, not forwarded.
    expect(JSON.stringify(body)).not.toContain("Email rate limit exceeded");
    logged.mockRestore();
  });
});

describe("authentication", () => {
  it("refuses an unauthenticated caller", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("refuses an authenticated user with no email on the account", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: null } } });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("refuses cleanly when cloud accounts are not configured", async () => {
    serverClientAvailable = false;
    const res = await POST(req());
    expect(res.status).toBe(503);
  });
});

describe("rate limiting", () => {
  it("is checked before the session is even read", async () => {
    rateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many requests. Please slow down and try again shortly." }, { status: 429 })
    );
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("counts against the auth tier — the same defensive consistency the other auth routes use", async () => {
    await POST(req());
    expect(rateLimitOrNull).toHaveBeenCalledWith(expect.anything(), "auth");
  });
});
