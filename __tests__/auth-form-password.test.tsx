import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const signUp = vi.fn();
const saveProfile = vi.fn();
const armPasswordSignup = vi.fn();
const trackSignupStarted = vi.fn();
const refreshSessionFromCookies = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      // Password sign-in and forgot-password no longer call the browser
      // client's own auth methods at all — both now go through a server
      // route, precisely so the email an identifier resolves to never has
      // to cross back into the browser. signInWithOtp (magic link) and
      // signUp (registration) are untouched by this fix and still call
      // through here directly.
      signInWithOtp: vi.fn(async () => ({ error: null })),
      signUp: (...a: unknown[]) => signUp(...a),
    },
  }),
}));
vi.mock("@/lib/supabase/session-store", () => ({
  refreshSessionFromCookies: (...a: unknown[]) => refreshSessionFromCookies(...a),
}));
vi.mock("@/components/auth/google-sign-in-button", () => ({ GoogleSignInButton: () => null }));
vi.mock("@/lib/supabase/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/profiles")>()),
  saveProfile: (...a: unknown[]) => saveProfile(...a),
}));
vi.mock("@/lib/analytics/signup", () => ({
  armPasswordSignup: (...a: unknown[]) => armPasswordSignup(...a),
}));
vi.mock("@/lib/analytics/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/events")>()),
  trackSignupStarted: (...a: unknown[]) => trackSignupStarted(...a),
}));

import { AuthForm } from "@/components/auth/auth-form";

function mockFetch(response: { status: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    }))
  );
}

function openPasswordSection() {
  fireEvent.click(screen.getByRole("button", { name: /sign in with a password/i }));
}

/**
 * The register form's own email field, disambiguated from the magic-link
 * email field above it — both are rendered in the same tree and share the
 * label "Email address", since to a screen reader they really are the same
 * kind of field.
 */
function registerEmailInput(): HTMLElement {
  const form = screen.getByLabelText("Username").closest("form")!;
  return within(form).getByLabelText("Email address");
}

beforeEach(() => {
  vi.clearAllMocks();
  saveProfile.mockResolvedValue({ ok: true, profile: {} });
  mockFetch({ status: 200, body: { ok: true } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the password door", () => {
  it("starts collapsed behind a toggle, so the popover is unchanged by default", () => {
    render(<AuthForm />);
    expect(screen.queryByLabelText("Password")).toBeNull();

    openPasswordSection();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });
});

describe("sign-in with an email or username", () => {
  it("sends the identifier and password to the server route in one request, and refreshes the session on success", async () => {
    render(<AuthForm />);
    openPasswordSection();

    fireEvent.change(screen.getByLabelText("Email or username"), {
      target: { value: "someuser" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter22" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(refreshSessionFromCookies).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/sign-in",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ identifier: "someuser", password: "hunter22" }),
      })
    );
    expect(trackSignupStarted).toHaveBeenCalledTimes(1);
  });

  it("shows the server's error message when the sign-in is refused", async () => {
    mockFetch({ status: 401, body: { error: "Invalid login credentials" } });
    render(<AuthForm />);
    openPasswordSection();

    fireEvent.change(screen.getByLabelText("Email or username"), {
      target: { value: "someuser@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid login credentials")).toBeTruthy();
    expect(refreshSessionFromCookies).not.toHaveBeenCalled();
  });

  it("surfaces a rate-limit refusal without ever refreshing the session", async () => {
    mockFetch({
      status: 429,
      body: { error: "Too many requests. Please slow down and try again shortly." },
    });
    render(<AuthForm />);
    openPasswordSection();

    fireEvent.change(screen.getByLabelText("Email or username"), {
      target: { value: "someuser" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter22" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/too many requests/i)).toBeTruthy();
    expect(refreshSessionFromCookies).not.toHaveBeenCalled();
  });

  it("switches to registration and back", () => {
    render(<AuthForm />);
    openPasswordSection();

    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
    expect(screen.getByLabelText("Username")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /already have an account/i }));
    expect(screen.queryByLabelText("Username")).toBeNull();
  });

  it("switches to forgot-password", () => {
    render(<AuthForm />);
    openPasswordSection();

    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));
    expect(screen.getByText(/we.ll email you a link/i)).toBeTruthy();
  });
});

describe("registration — email, username and password in one step", () => {
  function openRegister() {
    render(<AuthForm redirectTo="/tier-list" />);
    openPasswordSection();
    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
  }

  it("arms the password-signup marker and fires signup_started before calling signUp", async () => {
    signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: {} }, error: null });
    openRegister();

    fireEvent.change(registerEmailInput(), {
      target: { value: "new@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenoughpw" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(signUp).toHaveBeenCalled());
    expect(armPasswordSignup).toHaveBeenCalledTimes(1);
    expect(trackSignupStarted).toHaveBeenCalledTimes(1);
    // Armed before the call that might create the account, not after.
    const armOrder = armPasswordSignup.mock.invocationCallOrder[0];
    const signUpOrder = signUp.mock.invocationCallOrder[0];
    expect(armOrder).toBeLessThan(signUpOrder);
  });

  it("claims the username in the same step when signUp returns an immediate session", async () => {
    signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "x" } }, error: null });
    openRegister();

    fireEvent.change(registerEmailInput(), {
      target: { value: "new@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenoughpw" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(saveProfile).toHaveBeenCalledWith({ userId: "u1", username: "newuser", displayName: "" })
    );
  });

  it("defers the username claim and explains why, when confirmation leaves no immediate session", async () => {
    signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    openRegister();

    fireEvent.change(registerEmailInput(), {
      target: { value: "new@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenoughpw" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/confirm your account/i)).toBeTruthy();
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("shows Supabase's error when signUp itself is refused", async () => {
    signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: "User already registered" } });
    openRegister();

    fireEvent.change(registerEmailInput(), {
      target: { value: "new@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenoughpw" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("User already registered")).toBeTruthy();
  });

  it("refuses an invalid username before ever calling signUp", () => {
    openRegister();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "a" } });

    expect(screen.getByRole("button", { name: "Create account" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/at least 3 characters/i)).toBeTruthy();
  });
});

describe("forgot password", () => {
  function openForgot() {
    render(<AuthForm />);
    openPasswordSection();
    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));
  }

  it("sends the identifier to the server route, unresolved — the server does the resolving now", async () => {
    openForgot();

    fireEvent.change(screen.getByLabelText("Email or username"), {
      target: { value: "someuser" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/forgot-password",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ identifier: "someuser" }) })
    );
    expect(await screen.findByText(/a reset link is on its way/i)).toBeTruthy();
  });

  it("shows the same generic confirmation regardless of whether the account exists — the server response carries the ambiguity now, not just this copy", async () => {
    openForgot();

    fireEvent.change(screen.getByLabelText("Email or username"), {
      target: { value: "nobody-by-this-handle" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/a reset link is on its way/i)).toBeTruthy();
    expect(screen.queryByText(/no such|not found|does not exist/i)).toBeNull();
  });

  it("shows a real error when the route itself refuses the request", async () => {
    mockFetch({ status: 503, body: { error: "Cloud accounts are not configured." } });
    openForgot();

    fireEvent.change(screen.getByLabelText("Email or username"), {
      target: { value: "someuser@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText("Cloud accounts are not configured.")).toBeTruthy();
  });
});
