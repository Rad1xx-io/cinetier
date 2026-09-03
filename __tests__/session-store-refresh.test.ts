import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `refreshSessionFromCookies` closes the one gap `onAuthStateChange` does
 * not cover on its own: a session established by a server round trip
 * (`/api/auth/sign-in`) rather than by this browser client's own
 * `signInWith*` call. See its own doc in session-store.ts for the full
 * reasoning — this pins the actual behaviour: that calling it updates
 * every subscriber, using a fake `getSession()` shaped the way
 * `@supabase/auth-js` really behaves (reads storage fresh, does not itself
 * notify listeners for an already-valid session).
 *
 * The module under test keeps mutable, one-time-initialised singleton
 * state (`cached`, `initialized`, `listeners`), so every test needs a
 * fully fresh module instance — `vi.resetModules()` plus a dynamic
 * re-import in `beforeEach`, rather than importing once at the top.
 */

const getSession = vi.fn();
const getUser = vi.fn();
let configured = true;

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () =>
    configured
      ? {
          auth: {
            getUser: (...a: unknown[]) => getUser(...a),
            getSession: (...a: unknown[]) => getSession(...a),
            // Not exercised by these tests — refreshSessionFromCookies never
            // calls onAuthStateChange itself, only getSession. Present so
            // ensureInitialized's own registration call does not throw.
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          },
        }
      : null,
}));

async function freshStore() {
  vi.resetModules();
  return import("@/lib/supabase/session-store");
}

beforeEach(() => {
  vi.clearAllMocks();
  configured = true;
  getUser.mockResolvedValue({ data: { user: null } });
  getSession.mockResolvedValue({ data: { session: null } });
});
afterEach(() => vi.restoreAllMocks());

describe("refreshSessionFromCookies", () => {
  it("moves every subscriber to signed-in from a session onAuthStateChange never announced on its own", async () => {
    const { subscribeToSession, getSessionSnapshot, refreshSessionFromCookies } = await freshStore();
    const listener = vi.fn();
    subscribeToSession(listener);
    // Registering the subscriber also runs the one-time getUser() check —
    // clear so the assertion below is about refreshSessionFromCookies only.
    listener.mockClear();

    const user = { id: "u1", email: "a@example.test" };
    getSession.mockResolvedValue({ data: { session: { user } } });

    await refreshSessionFromCookies();

    expect(getSessionSnapshot()).toEqual({ status: "signed-in", user });
    expect(listener).toHaveBeenCalled();
  });

  it("moves to signed-out when there is no session to find", async () => {
    const { subscribeToSession, getSessionSnapshot, refreshSessionFromCookies } = await freshStore();
    subscribeToSession(() => {});

    getSession.mockResolvedValue({ data: { session: null } });
    await refreshSessionFromCookies();

    expect(getSessionSnapshot()).toEqual({ status: "signed-out" });
  });

  it("notifies every subscriber, not only the first", async () => {
    const { subscribeToSession, refreshSessionFromCookies } = await freshStore();
    const a = vi.fn();
    const b = vi.fn();
    subscribeToSession(a);
    subscribeToSession(b);
    a.mockClear();
    b.mockClear();

    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    await refreshSessionFromCookies();

    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it("does nothing when cloud accounts are not configured, rather than throwing", async () => {
    configured = false;
    const { refreshSessionFromCookies, getSessionSnapshot } = await freshStore();

    await expect(refreshSessionFromCookies()).resolves.toBeUndefined();
    expect(getSessionSnapshot()).toEqual({ status: "unconfigured" });
    expect(getSession).not.toHaveBeenCalled();
  });
});
