import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { CustomBoard as Board } from "@/lib/types/custom-list";

const deleteTierRow = vi.fn(async () => {});
const deleteItem = vi.fn(async () => {});
const clearTierRowImage = vi.fn(async () => {});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: null, loading: false }),
}));
vi.mock("@/lib/supabase/custom-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/custom-lists")>()),
  deleteTierRow: (...a: unknown[]) => deleteTierRow(...(a as [])),
  deleteItem: (...a: unknown[]) => deleteItem(...(a as [])),
  clearTierRowImage: (...a: unknown[]) => clearTierRowImage(...(a as [])),
}));

import { CustomBoard } from "@/components/custom-list/custom-board";

function board({ rowHasPicture = false } = {}): Board {
  return {
    list: { id: "list-1", userId: "u1", title: "Board", isPublic: true, hiddenAt: null, updatedAt: "2026-01-01" },
    rows: [
      {
        id: "row-s",
        listId: "list-1",
        position: 0,
        label: "S",
        color: "#ef4444",
        imagePath: rowHasPicture ? "cover.jpg" : null,
        imageUrl: rowHasPicture ? "https://example.test/cover.jpg" : null,
      },
    ],
    items: [
      {
        id: "item-1", listId: "list-1", rowId: "row-s", position: 0,
        caption: "best game", imagePath: "card.jpg",
        imageUrl: "https://example.test/card.jpg", hiddenAt: null,
      },
    ],
    canEdit: true,
    allowFork: false,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("destroying something asks first", () => {
  it("does not delete a tier when the question is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByLabelText("Delete the S tier"));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(deleteTierRow).not.toHaveBeenCalled();
  });

  it("does not delete a card when the question is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByLabelText("Delete this card"));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("says what deleting a tier will do to the cards in it", async () => {
    const asked = vi.fn((message?: string) => String(message ?? ""));
    vi.stubGlobal("confirm", asked);
    render(<CustomBoard board={board()} />);

    fireEvent.click(screen.getByLabelText("Delete the S tier"));

    await waitFor(() => expect(asked).toHaveBeenCalled());
    expect(String(asked.mock.calls[0]?.[0])).toMatch(/pool/i);
  });
});

describe("taking a picture off a tier", () => {
  it("offers the control only once there is a picture to remove", () => {
    // Rendered separately rather than re-rendered: whether the board adopts
    // new props is a different fix, still in review, and this should not be
    // waiting on it.
    render(<CustomBoard board={board({ rowHasPicture: false })} />);
    expect(screen.queryByLabelText("Remove this tier's picture")).toBeNull();
    cleanup();

    render(<CustomBoard board={board({ rowHasPicture: true })} />);
    expect(screen.queryByLabelText("Remove this tier's picture")).not.toBeNull();
  });

  it("clears the picture without touching the tier", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<CustomBoard board={board({ rowHasPicture: true })} />);

    fireEvent.click(screen.getByLabelText("Remove this tier's picture"));

    await waitFor(() => expect(clearTierRowImage).toHaveBeenCalled());
    // The distinction the whole incident turned on.
    expect(deleteTierRow).not.toHaveBeenCalled();
    expect(screen.getByText("best game")).toBeTruthy();
  });
});

describe("the bin is kept away from everything else", () => {
  it("shares no parent with the controls people reach for", () => {
    render(<CustomBoard board={board({ rowHasPicture: true })} />);

    const bin = screen.getByLabelText("Delete the S tier");
    const clear = screen.getByLabelText("Remove this tier's picture");
    const chooser = screen.getByText("Replace this tier's picture").closest("label")!;

    // They used to be siblings four pixels apart in one row, which is how
    // somebody deleted a tier while trying to take a picture off it.
    expect(bin.parentElement).not.toBe(clear.parentElement);
    expect(bin.parentElement).not.toBe(chooser.parentElement);
    // The bin belongs to the whole row; the other two belong to the label
    // column, so nothing can put them side by side again by accident.
    expect(clear.parentElement).toBe(chooser.parentElement?.parentElement);
  });

  it("gives both controls a target bigger than the old fourteen-pixel glyphs", () => {
    render(<CustomBoard board={board({ rowHasPicture: true })} />);

    for (const label of ["Delete the S tier", "Remove this tier's picture"]) {
      const control = screen.getByLabelText(label);
      // jsdom does no layout, so the size is read from the classes that set it.
      expect(control.className).toMatch(/h-[67] w-[67]/);
    }
  });
});
