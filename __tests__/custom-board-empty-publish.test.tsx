import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { CustomBoard as Board } from "@/lib/types/custom-list";

const publishCustomBoard = vi.fn(async () => ({ postId: "should-not-be-reached" }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: null, loading: false }),
}));
vi.mock("@/lib/supabase/custom-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/custom-lists")>()),
  publishCustomBoard: (...a: unknown[]) => publishCustomBoard(...(a as [])),
}));

import { CustomBoard } from "@/components/custom-list/custom-board";

function board({ itemCount = 0 } = {}): Board {
  return {
    list: { id: "list-1", userId: "u1", title: "Board", isPublic: true, hiddenAt: null, updatedAt: "2026-01-01" },
    rows: [{ id: "row-s", listId: "list-1", position: 0, label: "S", color: "#ef4444", imagePath: null, imageUrl: null }],
    items: Array.from({ length: itemCount }, (_, i) => ({
      id: `item-${i}`,
      listId: "list-1",
      rowId: "row-s",
      position: i,
      caption: "",
      imagePath: `card-${i}.jpg`,
      imageUrl: `https://example.test/card-${i}.jpg`,
      hiddenAt: null,
    })),
    canEdit: true,
    allowFork: false,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

/*
 * publishCustomBoard's own refusal (lib/supabase/custom-lists.ts) is covered in
 * publish-board-title.test.tsx, next to the title checks it shares a validation
 * order with. This file is about the layer in front of it — the button should
 * not even let the dialog open, so nobody types a title into a post that has
 * nothing to show.
 */
describe("publishing a board with no cards", () => {
  it("refuses at the button, with a reason, and never opens the dialog", () => {
    render(<CustomBoard board={board({ itemCount: 0 })} />);

    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    expect(screen.getByText(/add at least one picture/i)).toBeTruthy();
    // The dialog asks for a title — its absence is the proof it never opened.
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(publishCustomBoard).not.toHaveBeenCalled();
  });

  it("opens the dialog normally once the board has a card", () => {
    render(<CustomBoard board={board({ itemCount: 1 })} />);

    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(screen.queryByText(/add at least one picture/i)).toBeNull();
  });
});
