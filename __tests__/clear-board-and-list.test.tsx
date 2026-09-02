import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { CustomBoard as Board } from "@/lib/types/custom-list";

const clearCustomBoard = vi.fn(async () => {});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: null, loading: false }),
}));
vi.mock("@/lib/supabase/custom-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/custom-lists")>()),
  clearCustomBoard: (...a: unknown[]) => clearCustomBoard(...(a as [])),
}));

import { CustomBoard } from "@/components/custom-list/custom-board";

function board(itemCount: number): Board {
  return {
    list: { id: "list-1", userId: "u1", title: "Board", isPublic: true, hiddenAt: null, updatedAt: "2026-01-01" },
    rows: [{ id: "row-s", listId: "list-1", position: 0, label: "S", color: "#ef4444", imagePath: null, imageUrl: null }],
    items: Array.from({ length: itemCount }, (_, i) => ({
      id: `item-${i}`, listId: "list-1", rowId: "row-s", position: i,
      caption: `card ${i}`, imagePath: `p${i}.jpg`, imageUrl: `https://example.test/${i}.jpg`, hiddenAt: null,
    })),
    canEdit: true,
    allowFork: false,
  };
}

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "More board actions" }));
  await waitFor(() => expect(screen.getByRole("menu")).toBeTruthy());
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("clearing a custom board", () => {
  it("is not offered when the board already has nothing on it", async () => {
    render(<CustomBoard board={board(0)} />);
    await openMenu();
    expect(screen.queryByText("Clear board")).toBeNull();
  });

  it("names how many cards will go, and does nothing on a decline", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<CustomBoard board={board(3)} />);
    await openMenu();

    fireEvent.click(screen.getByText("Clear board"));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("3"));
    expect(clearCustomBoard).not.toHaveBeenCalled();
    // The tiers, not the cards: this dialog must not read as "Delete board".
    expect(String((window.confirm as ReturnType<typeof vi.fn>).mock.calls[0][0])).toMatch(/tiers stay/i);
  });

  it("empties the board and calls the storage-aware clear once confirmed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<CustomBoard board={board(2)} />);
    await openMenu();

    fireEvent.click(screen.getByText("Clear board"));

    await waitFor(() => expect(clearCustomBoard).toHaveBeenCalledWith(expect.anything(), "list-1"));
    expect(screen.queryByText("card 0")).toBeNull();
    expect(screen.queryByText("card 1")).toBeNull();
  });

  afterEach(() => vi.unstubAllGlobals());
});
