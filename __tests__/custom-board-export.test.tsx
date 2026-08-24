import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { CustomBoard as Board } from "@/lib/types/custom-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({}) }));

import { CustomBoard } from "@/components/custom-list/custom-board";

function board(canEdit: boolean): Board {
  return {
    list: { id: "list-1", userId: "u1", title: "Board", isPublic: true, hiddenAt: null, updatedAt: "2026-01-01" },
    rows: [
      {
        id: "row-s", listId: "list-1", position: 0, label: "S", color: "#ef4444",
        imagePath: "cover.jpg", imageUrl: "https://example.test/cover.jpg?token=abc",
      },
    ],
    items: [
      {
        id: "item-1", listId: "list-1", rowId: "row-s", position: 0, caption: "a card",
        imagePath: "card.jpg", imageUrl: "https://example.test/card.jpg?token=def", hiddenAt: null,
      },
    ],
    canEdit,
  };
}

afterEach(cleanup);

describe("saving a custom board as a picture", () => {
  it("is offered to whoever is looking, not only to the owner", () => {
    render(<CustomBoard board={board(false)} />);
    expect(screen.getByText(/Download PNG/)).toBeTruthy();
  });

  it("keeps every editing control out of the picture", () => {
    const { container } = render(<CustomBoard board={board(true)} />);

    // The capture filter drops anything carrying this attribute. Without it a
    // saved board would come out covered in bins, swatches and file pickers.
    const controls = [
      screen.getByLabelText("Delete the S tier"),
      screen.getByLabelText("Remove this tier's picture"),
    ];
    for (const control of controls) {
      expect(control.hasAttribute("data-export-hide")).toBe(true);
    }

    // The file chooser and colour swatch share a marked row.
    const chooser = screen.getByText("Replace this tier's picture").closest("label")!;
    expect(chooser.parentElement?.hasAttribute("data-export-hide")).toBe(true);

    // And the card's own hover controls.
    const cardControls = container.querySelector("[data-export-hide] button[aria-label='Hide this card']");
    expect(cardControls).not.toBeNull();
  });

  it("carries the site's name into the picture, since boards get shared as files", () => {
    const { container } = render(<CustomBoard board={board(false)} />);
    const watermark = container.querySelector("[data-export-watermark]");
    expect(watermark).not.toBeNull();
    // Invisible on the page itself; the export turns it up for the capture.
    expect(watermark?.className).toContain("opacity-0");
  });
});
