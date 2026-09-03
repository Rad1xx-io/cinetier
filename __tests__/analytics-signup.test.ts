import { afterEach, describe, expect, it } from "vitest";
import {
  alreadyCounted,
  armPasswordSignup,
  FIRST_SESSION_WINDOW_MS,
  isFirstSession,
  markCounted,
  signupMethod,
  type SignupUserLike,
} from "@/lib/analytics/signup";

function user(overrides: Partial<SignupUserLike> = {}): SignupUserLike {
  const now = new Date().toISOString();
  return { id: "u1", created_at: now, last_sign_in_at: now, ...overrides };
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe("isFirstSession", () => {
  it("counts an account signing in the moment it was created", () => {
    expect(isFirstSession(user())).toBe(true);
  });

  it("does not count a returning visitor as a new signup", () => {
    expect(
      isFirstSession(
        user({
          created_at: "2026-01-01T00:00:00Z",
          last_sign_in_at: "2026-08-17T09:00:00Z",
        })
      )
    ).toBe(false);
  });

  it("allows for the OAuth round trip", () => {
    // Google and back takes seconds, and a slow hop must not demote a signup.
    const created = Date.now();
    expect(
      isFirstSession(
        user({
          created_at: new Date(created).toISOString(),
          last_sign_in_at: new Date(created + FIRST_SESSION_WINDOW_MS - 1_000).toISOString(),
        })
      )
    ).toBe(true);
  });

  it("falls back to now when the provider reports no sign-in time", () => {
    expect(isFirstSession(user({ created_at: new Date().toISOString(), last_sign_in_at: null }))).toBe(
      true
    );
    expect(isFirstSession(user({ created_at: "2020-05-05T00:00:00Z", last_sign_in_at: null }))).toBe(
      false
    );
  });

  it("says nothing rather than guessing when the account has no age", () => {
    expect(isFirstSession(user({ created_at: undefined }))).toBe(false);
    expect(isFirstSession(user({ created_at: "not a date" }))).toBe(false);
  });
});

describe("signupMethod", () => {
  afterEach(() => sessionStorage.clear());

  it("reads the provider Supabase recorded", () => {
    expect(signupMethod(user({ app_metadata: { provider: "google" } }))).toBe("google");
    expect(signupMethod(user({ app_metadata: { provider: "email" } }))).toBe("magic_link");
  });

  it("assumes the magic link when the provider is missing or unknown", () => {
    expect(signupMethod(user({ app_metadata: null }))).toBe("magic_link");
    expect(signupMethod(user({ app_metadata: { provider: "github" } }))).toBe("magic_link");
  });

  /*
   * Supabase reports a password account under the identical
   * `provider: "email"` a magic link uses — the assertion right above this
   * one. armPasswordSignup's marker is the only thing that tells them apart.
   */
  it("reports password when the registration form armed the marker first", () => {
    armPasswordSignup();
    expect(signupMethod(user({ app_metadata: { provider: "email" } }))).toBe("password");
  });

  it("consumes the marker — a second account in the same tab is not also labelled password", () => {
    armPasswordSignup();
    signupMethod(user({ app_metadata: { provider: "email" } }));

    expect(signupMethod(user({ id: "u2", app_metadata: { provider: "email" } }))).toBe("magic_link");
  });

  it("does not let an armed marker override an actual Google sign-in", () => {
    armPasswordSignup();
    expect(signupMethod(user({ app_metadata: { provider: "google" } }))).toBe("google");
  });
});

describe("the once-per-account guard", () => {
  it("counts an account once, however many times the page reloads", () => {
    const storage = memoryStorage();
    expect(alreadyCounted("u1", storage)).toBe(false);
    markCounted("u1", storage);
    expect(alreadyCounted("u1", storage)).toBe(true);
  });

  it("still counts a second account on a shared machine", () => {
    const storage = memoryStorage();
    markCounted("u1", storage);
    expect(alreadyCounted("u2", storage)).toBe(false);
  });

  it("counts rather than throws when storage is unavailable", () => {
    // A blocked-storage visitor is counted once per load, which beats an
    // exception in a tracker.
    expect(alreadyCounted("u1", null)).toBe(false);
    expect(() => markCounted("u1", null)).not.toThrow();
  });

  it("survives a storage that throws on write", () => {
    const hostile = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;
    expect(alreadyCounted("u1", hostile)).toBe(false);
    expect(() => markCounted("u1", hostile)).not.toThrow();
  });
});
