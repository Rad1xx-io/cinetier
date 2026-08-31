import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the auth callback is willing to say out loud.
 *
 * Production verification caught this one directly: a failed exchange sent
 * back a `Location` header carrying Supabase's own explanation of PKCE
 * verifier storage, complete with advice about which library to use on the
 * server. That is a description of this deployment's internals, handed to
 * anyone who can make the exchange fail — which is anyone, since it only takes
 * a made-up `code`.
 *
 * These assert the shape of what leaves the server, not the wording of what a
 * person reads. The page's copy can change; "the provider's error text is not
 * in the URL" must not.
 */

const exchangeCodeForSession = vi.fn();
const getSupabaseServerClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => getSupabaseServerClient(),
}));

const { GET } = await import("@/app/auth/callback/route");

/** The real shape the route reads from — nextUrl plus a resolvable base. */
function requestFor(url: string) {
  const parsed = new URL(url);
  return { nextUrl: parsed, url } as unknown as Parameters<typeof GET>[0];
}

async function locationFor(url: string): Promise<string> {
  const response = await GET(requestFor(url));
  return response.headers.get("location") ?? "";
}

const BASE = "https://tierlistonline.com/auth/callback";

beforeEach(() => {
  exchangeCodeForSession.mockResolvedValue({ error: null });
  getSupabaseServerClient.mockResolvedValue({
    auth: { exchangeCodeForSession: (...a: unknown[]) => exchangeCodeForSession(...a) },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("the callback still works", () => {
  it("sends a successful sign-in to the requested path", async () => {
    const location = await locationFor(`${BASE}?code=good&redirect_to=/tier-list`);
    expect(location).toBe("https://tierlistonline.com/tier-list");
  });

  it("defaults to the home page with no destination given", async () => {
    expect(await locationFor(`${BASE}?code=good`)).toBe("https://tierlistonline.com/");
  });

  it("still refuses an off-origin destination on the success path", async () => {
    // The sanitizer must not have been weakened by this change.
    const location = await locationFor(`${BASE}?code=good&redirect_to=/%09/evil.com`);
    expect(location).toBe("https://tierlistonline.com/");
  });
});

describe("a failure says a code, never the provider's words", () => {
  /** The real message Supabase returned in production. */
  const REAL_SUPABASE_MESSAGE =
    "PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.";

  it("replaces the exchange error with an opaque code", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: REAL_SUPABASE_MESSAGE } });

    const location = await locationFor(`${BASE}?code=bogus`);

    expect(location).toBe("https://tierlistonline.com/auth/auth-code-error?reason=exchange-failed");
  });

  it.each([
    ["PKCE storage advice", REAL_SUPABASE_MESSAGE],
    ["a database error", 'duplicate key value violates unique constraint "users_email_key"'],
    ["a connection string", "could not connect to server at 10.0.0.4:5432"],
    ["a stack trace", "Error: boom\n    at Object.<anonymous> (/var/task/.next/server/app.js:1:1)"],
    ["a provider internal", "GoTrue: invalid_grant: code challenge did not match"],
  ])("keeps %s out of the Location header", async (_name, message) => {
    exchangeCodeForSession.mockResolvedValue({ error: { message } });

    const location = await locationFor(`${BASE}?code=bogus`);

    // Nothing of the message survives — checked by its distinctive words rather
    // than by the whole string, since a partial leak is still a leak.
    for (const word of message.split(/\s+/).filter((w) => w.length > 6)) {
      expect(location).not.toContain(word);
    }
    expect(location).toContain("reason=exchange-failed");
  });

  it("does not reflect the auth code, token or any other query parameter", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "nope" } });

    const location = await locationFor(
      `${BASE}?code=SECRETCODE123&access_token=SECRETTOKEN&refresh_token=SECRETREFRESH&state=SECRETSTATE`
    );

    expect(location).not.toContain("SECRETCODE123");
    expect(location).not.toContain("SECRETTOKEN");
    expect(location).not.toContain("SECRETREFRESH");
    expect(location).not.toContain("SECRETSTATE");
  });

  it("logs the real message server-side, so the detail is not simply lost", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    exchangeCodeForSession.mockResolvedValue({ error: { message: REAL_SUPABASE_MESSAGE } });

    await locationFor(`${BASE}?code=bogus`);

    expect(logged).toHaveBeenCalled();
    expect(logged.mock.calls.flat().join(" ")).toContain("PKCE code verifier");
  });

  it("does not log the single-use code alongside it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    exchangeCodeForSession.mockResolvedValue({ error: { message: "nope" } });

    await locationFor(`${BASE}?code=SECRETCODE123`);

    expect(logged.mock.calls.flat().join(" ")).not.toContain("SECRETCODE123");
  });
});

describe("the other two failure paths", () => {
  it("uses a code when no auth code is present", async () => {
    expect(await locationFor(BASE)).toBe(
      "https://tierlistonline.com/auth/auth-code-error?reason=no-code"
    );
  });

  it("uses a code when cloud accounts are not configured", async () => {
    getSupabaseServerClient.mockResolvedValue(null);
    expect(await locationFor(`${BASE}?code=good`)).toBe(
      "https://tierlistonline.com/auth/auth-code-error?reason=not-configured"
    );
  });
});
