import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

let sessionState: { configured: boolean; loading: boolean; user: { email: string } | null } = {
  configured: true,
  loading: false,
  user: { email: "reader@example.test" },
};
const signOut = vi.fn();

vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => sessionState,
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { signOut: () => signOut() } }),
}));
vi.mock("@/components/auth/auth-form", () => ({ AuthForm: () => null }));

import { AccountPanel } from "@/components/auth/account-panel";

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

beforeEach(() => {
  vi.clearAllMocks();
  sessionState = { configured: true, loading: false, user: { email: "reader@example.test" } };
  signOut.mockResolvedValue({ error: null });
  mockFetch({ status: 200, body: { ok: true } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("requesting a password change", () => {
  it("POSTs to the request route with no body — the session is the only input", async () => {
    render(<AccountPanel />);

    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith("/api/account/request-password-change", { method: "POST" });
    expect(await screen.findByText(/confirmation link is on its way/i)).toBeTruthy();
  });

  it("still shows Sign out even after the confirmation, and hides the request button", async () => {
    render(<AccountPanel />);

    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    await screen.findByText(/confirmation link is on its way/i);

    expect(screen.queryByRole("button", { name: /change password/i })).toBeNull();
  });

  it("shows the server's error when the request itself fails", async () => {
    mockFetch({ status: 500, body: { error: "Could not send the confirmation email. Please try again." } });
    render(<AccountPanel />);

    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    expect(
      await screen.findByText("Could not send the confirmation email. Please try again.")
    ).toBeTruthy();
    // Still on the button state, not the "sent" one, since the request failed.
    expect(screen.getByRole("button", { name: /change password/i })).toBeTruthy();
  });

  it("does not show the button at all for a signed-out visitor", () => {
    sessionState = { configured: true, loading: false, user: null };
    render(<AccountPanel />);
    expect(screen.queryByRole("button", { name: /change password/i })).toBeNull();
  });
});
