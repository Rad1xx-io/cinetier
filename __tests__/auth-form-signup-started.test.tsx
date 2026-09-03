import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const signInWithOtp = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}));
const trackSignupStarted = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { signInWithOtp } }),
}));
vi.mock("@/lib/analytics/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/events")>()),
  trackSignupStarted: (...args: unknown[]) => trackSignupStarted(...(args as [])),
}));
vi.mock("@/components/auth/google-sign-in-button", () => ({
  GoogleSignInButton: () => null,
}));

import { AuthForm } from "@/components/auth/auth-form";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("signup_started — the moment an email goes out for a magic link", () => {
  it("fires when the form is submitted, before Supabase answers", async () => {
    render(<AuthForm redirectTo="/tier-list" />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send me a link/i }));

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalled());
    expect(trackSignupStarted).toHaveBeenCalledTimes(1);
    // The entry point, nothing that identifies the person — the address
    // itself never reaches the event.
    expect(trackSignupStarted.mock.calls[0][0]).not.toContain("@");
  });

  it("still fires when Supabase goes on to refuse the address", async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { message: "rate limited" } });
    render(<AuthForm />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send me a link/i }));

    // signup_started reports the attempt, not the outcome — the same
    // distinction signup_completed already draws on the other end.
    await waitFor(() => expect(screen.getByText(/rate limited/i)).toBeTruthy());
    expect(trackSignupStarted).toHaveBeenCalledTimes(1);
  });
});
