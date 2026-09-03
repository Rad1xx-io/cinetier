import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse, type NextRequest } from "next/server";

/**
 * `createClient` (the isolated, cookie-less verifier) and
 * `getSupabaseServerClient` (the cookie-bound recovery-session client) are
 * mocked as two SEPARATE fakes on purpose — that separation is the whole
 * point of this route's design (see its own module doc), so a test that
 * collapsed them into one mock would not be able to catch a regression
 * where the route started verifying the current password against the
 * session client instead.
 */

const rateLimitOrNull = vi.fn();
const getUser = vi.fn();
const rpc = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const verifierSignInWithPassword = vi.fn();
const createClientMock = vi.fn();
let serverClientAvailable = true;

vi.mock("@/lib/rate-limit/limiter", () => ({
  rateLimitOrNull: (...a: unknown[]) => rateLimitOrNull(...a),
}));
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseEnv: () => ({ url: "https://stub.supabase.co", anonKey: "stub" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () =>
    serverClientAvailable
      ? {
          auth: {
            getUser: (...a: unknown[]) => getUser(...a),
            updateUser: (...a: unknown[]) => updateUser(...a),
            signOut: (...a: unknown[]) => signOut(...a),
          },
          rpc: (...a: unknown[]) => rpc(...a),
        }
      : null,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...a: unknown[]) => {
    createClientMock(...a);
    return { auth: { signInWithPassword: (...b: unknown[]) => verifierSignInWithPassword(...b) } };
  },
}));

const { POST } = await import("@/app/api/account/change-password/route");

function jsonRequest(body: unknown): NextRequest {
  return new Request("https://tierlistonline.com/api/account/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  serverClientAvailable = true;
  rateLimitOrNull.mockResolvedValue(null);
  getUser.mockResolvedValue({ data: { user: { id: "u1", email: "reader@example.test" } } });
  rpc.mockResolvedValue({ data: true, error: null });
  updateUser.mockResolvedValue({ error: null });
  signOut.mockResolvedValue({ error: null });
  verifierSignInWithPassword.mockResolvedValue({ error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("an account with a password, correct current password", () => {
  it("verifies through the isolated client, updates the password, and signs out other sessions", async () => {
    const res = await POST(
      jsonRequest({ currentPassword: "old-hunter2", newPassword: "new-hunter2222" })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(verifierSignInWithPassword).toHaveBeenCalledWith({
      email: "reader@example.test",
      password: "old-hunter2",
    });
    expect(updateUser).toHaveBeenCalledWith({ password: "new-hunter2222" });
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("verifies against a client that is not the recovery-session client", async () => {
    await POST(jsonRequest({ currentPassword: "old-hunter2", newPassword: "new-hunter2222" }));

    // createClient was actually called to build a separate client — the
    // verification did not happen through getSupabaseServerClient()'s own
    // instance, which has no createClient call of its own at all.
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(
      "https://stub.supabase.co",
      "stub",
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) })
    );
  });

  it("verifies before updating, never the other way around", async () => {
    await POST(jsonRequest({ currentPassword: "old-hunter2", newPassword: "new-hunter2222" }));

    const verifyOrder = verifierSignInWithPassword.mock.invocationCallOrder[0];
    const updateOrder = updateUser.mock.invocationCallOrder[0];
    expect(verifyOrder).toBeLessThan(updateOrder);
  });
});

describe("an account with a password, wrong current password", () => {
  it("is refused with a specific message, and never reaches updateUser", async () => {
    verifierSignInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });

    const res = await POST(jsonRequest({ currentPassword: "wrong", newPassword: "new-hunter2222" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Your current password is incorrect." });
    expect(updateUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("still fails when currentPassword is missing entirely — never silently skipped", async () => {
    const res = await POST(jsonRequest({ newPassword: "new-hunter2222" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Enter your current password." });
    expect(verifierSignInWithPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe("an account with no password yet — setting the first one", () => {
  it("succeeds without ever calling the verifier", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    const res = await POST(jsonRequest({ newPassword: "new-hunter2222" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(verifierSignInWithPassword).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalledWith({ password: "new-hunter2222" });
  });

  it("ignores a currentPassword field even if one was sent — not required, not checked", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    await POST(jsonRequest({ currentPassword: "whatever", newPassword: "new-hunter2222" }));

    expect(verifierSignInWithPassword).not.toHaveBeenCalled();
  });
});

describe("account_has_password itself fails to answer", () => {
  it("fails closed with a generic error, never guessing either direction", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } });

    const res = await POST(jsonRequest({ currentPassword: "x", newPassword: "new-hunter2222" }));

    expect(res.status).toBe(500);
    expect(verifierSignInWithPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("signOut({ scope: 'others' }) failing", () => {
  it("still reports success — the password change itself already happened", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    signOut.mockResolvedValue({ error: { message: "boom" } });

    const res = await POST(jsonRequest({ currentPassword: "old-hunter2", newPassword: "new-hunter2222" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    logged.mockRestore();
  });
});

describe("the response body never carries either password", () => {
  it("on success", async () => {
    const res = await POST(jsonRequest({ currentPassword: "old-hunter2", newPassword: "new-hunter2222" }));
    const raw = await res.text();
    expect(raw).not.toContain("old-hunter2");
    expect(raw).not.toContain("new-hunter2222");
  });

  it("on a wrong current password", async () => {
    verifierSignInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const res = await POST(jsonRequest({ currentPassword: "old-hunter2", newPassword: "new-hunter2222" }));
    const raw = await res.text();
    expect(raw).not.toContain("old-hunter2");
    expect(raw).not.toContain("new-hunter2222");
  });

  it("on updateUser itself failing", async () => {
    updateUser.mockResolvedValue({ error: { message: "Password should be at least 6 characters" } });
    const res = await POST(jsonRequest({ currentPassword: "old-hunter2", newPassword: "new-hunter2222" }));
    const raw = await res.text();
    expect(raw).not.toContain("old-hunter2");
    expect(raw).not.toContain("new-hunter2222");
  });
});

describe("input validation", () => {
  it("refuses a new password under 8 characters, before ever touching Supabase", async () => {
    const res = await POST(jsonRequest({ currentPassword: "old-hunter2", newPassword: "short1" }));
    expect(res.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("refuses malformed JSON", async () => {
    const req = new Request("https://tierlistonline.com/api/account/change-password", {
      method: "POST",
      body: "not json",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("rate limiting", () => {
  it("is checked before anything else", async () => {
    rateLimitOrNull.mockResolvedValue(
      NextResponse.json({ error: "Too many requests. Please slow down and try again shortly." }, { status: 429 })
    );
    const res = await POST(jsonRequest({ currentPassword: "x", newPassword: "new-hunter2222" }));
    expect(res.status).toBe(429);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("counts against the auth tier", async () => {
    await POST(jsonRequest({ currentPassword: "old-hunter2", newPassword: "new-hunter2222" }));
    expect(rateLimitOrNull).toHaveBeenCalledWith(expect.anything(), "auth");
  });
});

describe("authentication", () => {
  it("refuses an unauthenticated caller", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(jsonRequest({ currentPassword: "old-hunter2", newPassword: "new-hunter2222" }));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses cleanly when cloud accounts are not configured", async () => {
    serverClientAvailable = false;
    const res = await POST(jsonRequest({ currentPassword: "old-hunter2", newPassword: "new-hunter2222" }));
    expect(res.status).toBe(503);
  });
});
