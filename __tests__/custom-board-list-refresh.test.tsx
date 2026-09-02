import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { CustomBoard as Board } from "@/lib/types/custom-list";
import type { PublishOutcome } from "@/lib/supabase/custom-lists";

const refresh = vi.fn();
const deleteItem = vi.fn(async () => {});
const setItemHidden = vi.fn(async () => {});
const setBoardVisibility = vi.fn(async () => {});
const clearCustomBoard = vi.fn(async () => {});
const publishCustomBoard = vi.fn<() => Promise<PublishOutcome>>(async () => ({ postId: "post-1" }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: null, loading: false }),
}));
vi.mock("@/lib/supabase/custom-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/custom-lists")>()),
  deleteItem: (...a: unknown[]) => deleteItem(...(a as [])),
  setItemHidden: (...a: unknown[]) => setItemHidden(...(a as [])),
  setBoardVisibility: (...a: unknown[]) => setBoardVisibility(...(a as [])),
  clearCustomBoard: (...a: unknown[]) => clearCustomBoard(...(a as [])),
  publishCustomBoard: (...a: unknown[]) => publishCustomBoard(...(a as [])),
}));

import { CustomBoard } from "@/components/custom-list/custom-board";

function board({ canEdit = true } = {}): Board {
  return {
    list: { id: "list-1", userId: "u1", title: "Board", isPublic: true, hiddenAt: null, updatedAt: "2026-01-01" },
    rows: [{ id: "row-s", listId: "list-1", position: 0, label: "S", color: "#ef4444", imagePath: null, imageUrl: null }],
    items: [
      {
        id: "item-1", listId: "list-1", rowId: "row-s", position: 0,
        caption: "a card", imagePath: "card.jpg",
        imageUrl: "https://example.test/card.jpg", hiddenAt: null,
      },
    ],
    canEdit,
    allowFork: false,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/*
 * /custom's own list is a different page from this one, so nothing here can
 * update it directly the way local state updates this page — its Client
 * Cache entry has to be invalidated instead, the same fix
 * create-board-form.test.tsx covers for board creation. Every action here
 * changes something that page shows: the cover picture, the card count, the
 * public/private badge, or whether the board has a live post.
 */
describe("actions here keep /custom's own list from going stale", () => {
  it("refreshes after deleting a card", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByLabelText("Delete this card"));

    await waitFor(() => expect(deleteItem).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it("refreshes after hiding a card", async () => {
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByLabelText("Hide this card"));

    await waitFor(() => expect(setItemHidden).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it("refreshes after toggling visibility", async () => {
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByRole("button", { name: "More board actions" }));
    await waitFor(() => expect(screen.getByRole("menu")).toBeTruthy());
    fireEvent.click(screen.getByText(/anyone with the link|only me/i));

    await waitFor(() => expect(setBoardVisibility).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it("refreshes after clearing the board", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByRole("button", { name: "More board actions" }));
    await waitFor(() => expect(screen.getByRole("menu")).toBeTruthy());
    fireEvent.click(screen.getByText("Clear board"));

    await waitFor(() => expect(clearCustomBoard).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it("refreshes after a successful publish", async () => {
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A real title" } });
    fireEvent.click(screen.getByRole("checkbox"));
    // Two matches once the dialog is open: the toolbar button that opened it,
    // and the dialog's own submit button, which renders after it.
    fireEvent.click(screen.getAllByRole("button", { name: /publish/i })[1]);

    await waitFor(() => expect(publishCustomBoard).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it("does not refresh when a publish is refused", async () => {
    publishCustomBoard.mockResolvedValueOnce({ error: "Add at least one picture before publishing." });
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A real title" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getAllByRole("button", { name: /publish/i })[1]);

    await waitFor(() => expect(publishCustomBoard).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });
});

/*
 * Own back link, not relied on the browser's: this page has exactly one
 * place it is ever reached from, the same way /discover, /anime, /games and
 * /youtube already earn one instead of leaning on history.
 */
describe("a real link back to your boards", () => {
  it("is offered to the owner, and points at /custom", () => {
    render(<CustomBoard board={board({ canEdit: true })} />);

    const back = screen.getByRole("link", { name: /your boards/i });
    expect(back.getAttribute("href")).toBe("/custom");
  });

  it("is not offered to someone viewing a shared board — they have no boards list of their own to return to", () => {
    render(<CustomBoard board={board({ canEdit: false })} />);

    expect(screen.queryByRole("link", { name: /your boards/i })).toBeNull();
  });
});
