import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

let sessionState: { configured: boolean; loading: boolean; user: { id: string } | null } = {
  configured: true,
  loading: false,
  user: { id: "u1" },
};
const rpc = vi.fn();

vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => sessionState,
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }),
}));

import { ChangePasswordPanel } from "@/components/auth/change-password-panel";

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
  sessionState = { configured: true, loading: false, user: { id: "u1" } };
  rpc.mockResolvedValue({ data: true, error: null });
  mockFetch({ status: 200, body: { ok: true } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("no recovery session — a broken, expired, or already-used link", () => {
  it("says the link is invalid rather than showing a form nothing can submit", async () => {
    sessionState = { configured: true, loading: false, user: null };
    render(<ChangePasswordPanel />);

    expect(await screen.findByText(/invalid or has expired/i)).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });
});

describe("cloud accounts not configured", () => {
  it("says so instead of rendering a form with nothing behind it", () => {
    sessionState = { configured: false, loading: false, user: null };
    render(<ChangePasswordPanel />);
    expect(screen.getByText(/not configured/i)).toBeTruthy();
  });
});

describe("an account that already has a password", () => {
  it("asks for the current password too, and the heading matches the button", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    render(<ChangePasswordPanel />);

    expect(await screen.findByLabelText("Current password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change password" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Change your password" })).toBeTruthy();
  });

  it("submits current and new password together", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    render(<ChangePasswordPanel />);
    await screen.findByLabelText("Current password");

    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "old-hunter2" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-hunter2222" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-hunter2222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/account/change-password",
      expect.objectContaining({
        body: JSON.stringify({ currentPassword: "old-hunter2", newPassword: "new-hunter2222" }),
      })
    );
    expect(await screen.findByText(/password updated/i)).toBeTruthy();
  });

  it("shows the server's error when the current password is wrong", async () => {
    mockFetch({ status: 401, body: { error: "Your current password is incorrect." } });
    rpc.mockResolvedValue({ data: true, error: null });
    render(<ChangePasswordPanel />);
    await screen.findByLabelText("Current password");

    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "wrong" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-hunter2222" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-hunter2222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Your current password is incorrect.")).toBeTruthy();
  });
});

describe("an account with no password yet", () => {
  it("never shows a current-password field, and offers to set one instead of changing one", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    render(<ChangePasswordPanel />);

    expect(await screen.findByRole("button", { name: "Set a password" })).toBeTruthy();
    expect(screen.queryByLabelText("Current password")).toBeNull();
  });

  it("the heading reads the same as the button — not one of each word", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    render(<ChangePasswordPanel />);

    expect(await screen.findByRole("heading", { name: "Set a password" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set a password" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /change/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /change/i })).toBeNull();
  });

  it("submits without a currentPassword field at all", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    render(<ChangePasswordPanel />);
    await screen.findByRole("button", { name: "Set a password" });

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-hunter2222" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-hunter2222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set a password" }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/account/change-password",
      expect.objectContaining({ body: JSON.stringify({ newPassword: "new-hunter2222" }) })
    );
  });

  it("says 'Password set.', not 'updated', once it succeeds — nothing existed before this", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    render(<ChangePasswordPanel />);
    await screen.findByRole("button", { name: "Set a password" });

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-hunter2222" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-hunter2222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set a password" }));

    expect(await screen.findByText(/password set\./i)).toBeTruthy();
    expect(screen.queryByText(/password updated/i)).toBeNull();
  });
});

describe("mismatched new/confirm password — a client-side check before the round trip", () => {
  it("disables submit and shows a message, without ever calling fetch", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    render(<ChangePasswordPanel />);
    await screen.findByRole("button", { name: "Set a password" });

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-hunter2222" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "different" } });

    expect(screen.getByText(/don.t match/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set a password" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Set a password" }));
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("checking whether the account has a password fails", () => {
  it("shows an error instead of guessing which form to render", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    render(<ChangePasswordPanel />);

    expect(await screen.findByText(/could not load your account/i)).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });
});
