import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const updateUser = vi.fn();
let sessionState: { configured: boolean; loading: boolean; user: { id: string } | null } = {
  configured: true,
  loading: false,
  user: null,
};

vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => sessionState,
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { updateUser: (...a: unknown[]) => updateUser(...a) } }),
}));

import { ResetPasswordPanel } from "@/components/auth/reset-password-panel";

beforeEach(() => {
  vi.clearAllMocks();
  sessionState = { configured: true, loading: false, user: null };
  updateUser.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("no recovery session — a broken, expired, or already-used link", () => {
  it("says the link is invalid rather than showing a form nothing can submit", () => {
    render(<ResetPasswordPanel />);

    expect(screen.getByText(/invalid or has expired/i)).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });
});

describe("cloud accounts not configured", () => {
  it("says so instead of rendering a form with nothing behind it", () => {
    sessionState = { configured: false, loading: false, user: null };
    render(<ResetPasswordPanel />);

    expect(screen.getByText(/not configured/i)).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });
});

describe("still checking the session", () => {
  it("shows a neutral message, not the invalid-link one, while it is unknown either way", () => {
    sessionState = { configured: true, loading: true, user: null };
    render(<ResetPasswordPanel />);

    expect(screen.getByText(/checking your link/i)).toBeTruthy();
    expect(screen.queryByText(/invalid or has expired/i)).toBeNull();
  });
});

describe("a real recovery session", () => {
  beforeEach(() => {
    sessionState = { configured: true, loading: false, user: { id: "u1" } };
  });

  it("sets the new password and confirms", async () => {
    render(<ResetPasswordPanel />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "a-long-enough-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: "a-long-enough-password" }));
    expect(await screen.findByText(/password updated/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /continue to tierlistonline/i })).toBeTruthy();
  });

  it("shows Supabase's own error when the update is refused", async () => {
    updateUser.mockResolvedValue({ error: { message: "Password should be at least 8 characters" } });
    render(<ResetPasswordPanel />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short12" } });
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    expect(await screen.findByText("Password should be at least 8 characters")).toBeTruthy();
  });
});
