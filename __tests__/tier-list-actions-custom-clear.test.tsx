import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const clearAll = vi.fn();
const clearAllChannels = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: null, loading: false }),
}));
vi.mock("@/lib/supabase/profiles", () => ({ getMyProfile: async () => null }));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  clearAll: (...a: unknown[]) => clearAll(...(a as [])),
}));
vi.mock("@/lib/storage/youtube", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/youtube")>()),
  clearAllChannels: (...a: unknown[]) => clearAllChannels(...(a as [])),
}));

import { TierListActions } from "@/components/tier-list/tier-list-actions";

function renderActions(titlesCount: number) {
  const boardRef = { current: null };
  return render(
    <TierListActions
      boardRef={boardRef}
      onNotify={() => {}}
      titles={Array.from({ length: titlesCount }, (_, i) => ({
        tmdbId: i, mediaType: "movie", title: `Film ${i}`, posterPath: null,
        releaseDate: "2020-01-01", tier: "S", order: i, addedAt: 0, updatedAt: 0,
      })) as never}
      channels={[]}
    />
  );
}

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "More list actions" }));
  await waitFor(() => expect(screen.getByRole("menu")).toBeTruthy());
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a second entry point into your own boards", () => {
  it("offers a visible Custom button, not tucked behind the overflow menu", () => {
    renderActions(3);
    const link = screen.getByRole("link", { name: /custom/i });
    expect(link.getAttribute("href")).toBe("/custom");
    // Visible means: not inside the closed menu panel.
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("clearing the whole tier list", () => {
  it("is not offered on an empty list", async () => {
    renderActions(0);
    await openMenu();
    expect(screen.queryByText("Clear list")).toBeNull();
  });

  it("names the count, and does nothing on a decline", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    renderActions(5);
    await openMenu();

    fireEvent.click(screen.getByText("Clear list"));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("5"));
    expect(clearAll).not.toHaveBeenCalled();
  });

  it("clears both stores once confirmed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderActions(2);
    await openMenu();

    fireEvent.click(screen.getByText("Clear list"));

    expect(clearAll).toHaveBeenCalled();
    expect(clearAllChannels).toHaveBeenCalled();
  });
});
