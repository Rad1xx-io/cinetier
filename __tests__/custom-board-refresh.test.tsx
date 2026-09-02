import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { CustomBoard as Board } from "@/lib/types/custom-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => null }));

import { CustomBoard } from "@/components/custom-list/custom-board";

function board(captions: string[]): Board {
  return {
    list: {
      id: "list-1",
      userId: "user-1",
      title: "A board",
      isPublic: true,
      hiddenAt: null,
      updatedAt: new Date().toISOString(),
    },
    rows: [
      { id: "row-s", listId: "list-1", position: 0, label: "S", color: "#ef4444", imagePath: null, imageUrl: null },
    ],
    items: captions.map((caption, index) => ({
      id: `item-${index}`,
      listId: "list-1",
      rowId: "row-s",
      position: index,
      caption,
      imagePath: `path-${index}.jpg`,
      imageUrl: `https://example.test/signed-${index}.jpg`,
      hiddenAt: null,
    })),
    canEdit: false,
    allowFork: false,
  };
}

afterEach(cleanup);

describe("a board that has just been told about a new picture", () => {
  it("shows the card the server sent, without waiting for a reload", () => {
    // Uploading calls router.refresh(), the server re-renders, and the board
    // is handed a new list of items as props. Before this was fixed the board
    // kept the copy it took when it mounted, so the picture existed everywhere
    // except on screen.
    const { rerender } = render(<CustomBoard board={board(["first"])} />);
    expect(screen.getByText("first")).toBeTruthy();

    rerender(<CustomBoard board={board(["first", "just uploaded"])} />);

    expect(screen.queryByText("just uploaded")).not.toBeNull();
  });

  it("keeps every card's picture eager, so none of them waits for a viewport", () => {
    render(<CustomBoard board={board(["one", "two"])} />);
    const covers = screen.getAllByRole("img");
    expect(covers.length).toBeGreaterThan(0);
    for (const cover of covers) {
      // A lazy cover never arrives in a tab that is not drawing frames, which
      // is what an export, a screenshot and a background tab all are.
      expect(cover.getAttribute("loading")).not.toBe("lazy");
    }
  });
});
