import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

/**
 * The part of this fix a passing typecheck cannot prove: since
 * `signInWithPassword` now runs server-side, nothing on this browser
 * client's own initiative fires `onAuthStateChange` any more, so
 * `AuthArea` swapping from "Sign in" to the account menu depends entirely
 * on `AuthForm` explicitly calling `refreshSessionFromCookies` after a
 * successful response — a step that is easy to add, and just as easy to
 * forget silently, since everything else keeps compiling either way. This
 * uses the real `session-store.ts` and the real `AuthArea`, not mocks of
 * either, so the only thing standing between "Sign in" and the account menu
 * here is the actual wiring this fix added.
 */

interface FakeUser {
  id: string;
  email?: string;
}

let onAuthStateChangeCallback: ((event: string, session: unknown) => void) | null = null;
const getUser = vi.fn(async (): Promise<{ data: { user: FakeUser | null } }> => ({
  data: { user: null },
}));
const getSession = vi.fn(async (): Promise<{ data: { session: { user: FakeUser } | null } }> => ({
  data: { session: null },
}));
const signOut = vi.fn(async (): Promise<{ error: null }> => ({ error: null }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUser: () => getUser(),
      getSession: () => getSession(),
      signOut: () => signOut(),
      signInWithOtp: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        onAuthStateChangeCallback = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  }),
}));
vi.mock("@/components/auth/google-sign-in-button", () => ({ GoogleSignInButton: () => null }));

function mockSignInFetchSuccess() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }))
  );
}

/**
 * `session-store.ts` keeps mutable, one-time-initialised module state
 * (`cached`, `initialized`, `listeners`) — real, not mocked, in this file,
 * since faking it away would be faking the exact thing under test. Each
 * test needs its own fresh instance of it, which means a fresh instance of
 * everything importing it too; `vi.resetModules()` plus a dynamic
 * re-import per test, rather than one static import at the top, is what
 * gets that.
 */
async function freshAuthArea() {
  vi.resetModules();
  const mod = await import("@/components/navigation/auth-area");
  return mod.AuthArea;
}

beforeEach(() => {
  vi.clearAllMocks();
  onAuthStateChangeCallback = null;
  getUser.mockResolvedValue({ data: { user: null } });
  getSession.mockResolvedValue({ data: { session: null } });
  mockSignInFetchSuccess();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Opens the header's sign-in popover and expands the password section,
 * returning the popover's own container so a later query for the form's
 * "Sign in" submit button can be scoped to it — the header shows two more
 * "Sign in" buttons of its own (compact/wide responsive variants), so an
 * unscoped role query is ambiguous the moment the popover is open.
 */
async function openPasswordPopover(): Promise<HTMLElement> {
  fireEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]);
  const popover = (await screen.findByText("Sign in to TierListOnline")).closest("div")!;
  fireEvent.click(within(popover).getByRole("button", { name: /sign in with a password/i }));
  return popover;
}

describe("password sign-in updates the header without a page reload", () => {
  it("swaps 'Sign in' for the account menu once the server confirms sign-in", async () => {
    const AuthArea = await freshAuthArea();
    render(<AuthArea />);

    // Starts genuinely signed out — not an accident of the mock's defaults.
    await screen.findAllByRole("button", { name: "Sign in" });
    expect(onAuthStateChangeCallback).not.toBeNull();

    const popover = await openPasswordPopover();
    fireEvent.change(within(popover).getByLabelText("Email or username"), {
      target: { value: "reader@example.test" },
    });
    fireEvent.change(within(popover).getByLabelText("Password"), { target: { value: "hunter22" } });

    // What refreshSessionFromCookies will find once it asks — simulating
    // the fresh cookies the server route just wrote, exactly as a real
    // browser would have them after the POST resolves.
    getSession.mockResolvedValue({
      data: { session: { user: { id: "u1", email: "reader@example.test" } } },
    });

    fireEvent.click(within(popover).getByRole("button", { name: "Sign in" }));

    // The actual proof: the header itself flips, with nothing in this test
    // ever calling location.reload or re-rendering the tree from scratch.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull());
    expect(screen.getByText("reader@example.test")).toBeTruthy();
    expect(getSession).toHaveBeenCalled();
  });

  it("does not transition on a refused sign-in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: "Invalid login credentials" }),
      }))
    );
    const AuthArea = await freshAuthArea();
    render(<AuthArea />);

    await screen.findAllByRole("button", { name: "Sign in" });
    const popover = await openPasswordPopover();
    fireEvent.change(within(popover).getByLabelText("Email or username"), {
      target: { value: "reader@example.test" },
    });
    fireEvent.change(within(popover).getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(within(popover).getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid login credentials")).toBeTruthy();
    expect(getSession).not.toHaveBeenCalled();
    // Still signed out — the header never flips on a refusal.
    expect(screen.getAllByRole("button", { name: "Sign in" }).length).toBeGreaterThan(0);
  });
});
