import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { CustomBoard as Board } from "@/lib/types/custom-list";
import type { ForkableRow, ForkBoardOutcome } from "@/lib/supabase/custom-lists";

const push = vi.fn();
const refresh = vi.fn();
const forkCustomBoard = vi.fn<
  (supabase: unknown, userId: string, title: string, rows: ForkableRow[]) => Promise<ForkBoardOutcome>
>(async () => ({ id: "new-board" }));
const trackForkClicked = vi.fn();
const trackForkCreated = vi.fn();

let sessionUser: { id: string } | null = { id: "forker-1" };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: sessionUser, loading: false }),
}));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("@/lib/supabase/custom-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/custom-lists")>()),
  forkCustomBoard: (...a: unknown[]) =>
    forkCustomBoard(...(a as [unknown, string, string, ForkableRow[]])),
}));
vi.mock("@/lib/analytics/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/events")>()),
  trackForkClicked: (...a: unknown[]) => trackForkClicked(...(a as [])),
  trackForkCreated: (...a: unknown[]) => trackForkCreated(...(a as [])),
}));

import { CustomBoard } from "@/components/custom-list/custom-board";

function board({ canEdit = false, allowFork = true } = {}): Board {
  return {
    list: { id: "board-1", userId: "owner-1", title: "Someone's holiday photos", isPublic: true, hiddenAt: null, updatedAt: "2026-01-01" },
    rows: [
      { id: "row-s", listId: "board-1", position: 0, label: "S", color: "#ef4444", imagePath: null, imageUrl: null },
      { id: "row-a", listId: "board-1", position: 1, label: "A", color: "#f59e0b", imagePath: null, imageUrl: null },
    ],
    items: [
      {
        id: "item-1", listId: "board-1", rowId: "row-s", position: 0,
        caption: "a card", imagePath: "card.jpg",
        imageUrl: "https://example.test/card.jpg", hiddenAt: null,
      },
    ],
    canEdit,
    allowFork,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "forker-1" };
});
afterEach(cleanup);

describe("the fork button on someone else's board", () => {
  it("is not offered to the board's own owner", () => {
    render(<CustomBoard board={board({ canEdit: true })} />);
    expect(screen.queryByRole("button", { name: /fork/i })).toBeNull();
  });

  it("is not offered when the owner has forking turned off", () => {
    render(<CustomBoard board={board({ allowFork: false })} />);
    expect(screen.queryByRole("button", { name: /fork/i })).toBeNull();
  });

  it("copies the visible tiers' label and colour, not their pictures", async () => {
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByRole("button", { name: /fork/i }));

    await waitFor(() => expect(forkCustomBoard).toHaveBeenCalled());
    const [, forkerId, title, rows] = forkCustomBoard.mock.calls[0];
    expect(forkerId).toBe("forker-1");
    expect(title).toContain("Someone's holiday photos");
    expect(rows).toEqual([
      { label: "S", color: "#ef4444" },
      { label: "A", color: "#f59e0b" },
    ]);
  });

  it("tracks the click regardless of what happens next", async () => {
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByRole("button", { name: /fork/i }));

    await waitFor(() => expect(trackForkClicked).toHaveBeenCalledWith("board-1", "owner-1"));
  });

  it("refreshes and lands on the new board on success", async () => {
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByRole("button", { name: /fork/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/custom/new-board"));
    expect(trackForkCreated).toHaveBeenCalledWith("board-1", "new-board");
    // Same reasoning as creating a board: /custom would not show the new one
    // on a later Back press without this.
    expect(refresh).toHaveBeenCalled();
  });

  it("asks a signed-out visitor to sign in, and does not attempt to write", async () => {
    sessionUser = null;
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByRole("button", { name: /fork/i }));

    await waitFor(() => expect(screen.getByText(/sign in to fork/i)).toBeTruthy());
    expect(forkCustomBoard).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the reason when the write is refused, and does not navigate away", async () => {
    forkCustomBoard.mockResolvedValueOnce({ error: "Something went wrong. Please try again." });
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByRole("button", { name: /fork/i }));

    await waitFor(() => expect(screen.getByText("Something went wrong. Please try again.")).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
  });
});
