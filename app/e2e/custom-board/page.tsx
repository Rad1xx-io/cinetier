import type { Metadata } from "next";
import { CustomBoard } from "@/components/custom-list/custom-board";
import type { CustomBoard as Board } from "@/lib/types/custom-list";

/**
 * A fixed board, rendered without a session, so Playwright can drive it.
 *
 * The real board at `/custom/[id]` resolves its data on the server, inside an
 * `async` component that calls Supabase before a byte reaches the browser —
 * out of reach for `page.route`, which only intercepts requests the *browser*
 * makes. This route skips that step and hands `<CustomBoard>` a fixture
 * directly, so what the browser actually does — click "Clear board", answer
 * the confirmation, call `clearCustomBoard`, remove the now-orphaned files —
 * happens for real and is interceptable for real.
 *
 * Permanent, not a scratch file: e2e coverage of the board's destructive
 * actions has nowhere else to attach without a live Supabase project, which
 * this codebase does not run in CI. `noindex` and unlinked from anywhere a
 * person would navigate.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

const board: Board = {
  list: {
    id: "e2e-fixture-list",
    userId: "e2e-fixture-user",
    title: "e2e fixture board",
    isPublic: true,
    hiddenAt: null,
    updatedAt: "2026-01-01T00:00:00Z",
  },
  rows: [
    { id: "row-s", listId: "e2e-fixture-list", position: 0, label: "S", color: "#ef4444", imagePath: null, imageUrl: null },
    { id: "row-a", listId: "e2e-fixture-list", position: 1, label: "A", color: "#f59e0b", imagePath: null, imageUrl: null },
  ],
  items: [
    {
      id: "item-1", listId: "e2e-fixture-list", rowId: "row-s", position: 0,
      caption: "first card", imagePath: "e2e-fixture-user/e2e-fixture-list/one.jpg",
      imageUrl: "https://example.test/one.jpg", hiddenAt: null,
    },
    {
      id: "item-2", listId: "e2e-fixture-list", rowId: "row-a", position: 0,
      caption: "second card", imagePath: "e2e-fixture-user/e2e-fixture-list/two.jpg",
      imageUrl: "https://example.test/two.jpg", hiddenAt: null,
    },
  ],
  canEdit: true,
};

export default function CustomBoardFixturePage() {
  return <CustomBoard board={board} />;
}
