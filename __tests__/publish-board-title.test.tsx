import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishCustomBoard } from "@/lib/supabase/custom-lists";
import type { CustomBoard } from "@/lib/types/custom-list";
import { PublishBoardDialog } from "@/components/custom-list/publish-board-dialog";

afterEach(cleanup);

function board(title: string): CustomBoard {
  return {
    list: { id: "l1", userId: "u1", title, isPublic: true, hiddenAt: null, updatedAt: "2026-01-01" },
    rows: [{ id: "r1", listId: "l1", position: 0, label: "S", color: "#ef4444", imagePath: null, imageUrl: null }],
    items: [],
    canEdit: true,
  };
}

describe("a board whose name is shorter than a post title may be", () => {
  it("is refused before the database is asked, in words that name the problem", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as SupabaseClient;

    // "ez" — a perfectly good board name, two characters long, and the exact
    // one that came back from production as a check constraint violation.
    const outcome = await publishCustomBoard(supabase, board("ez"), "ez", "");

    expect(outcome).toEqual({ error: "The title is too short." });
    // Nothing was written, so nothing has to be taken back.
    expect(from).not.toHaveBeenCalled();
  });

  it("does not reject a name that only looks short because of spaces", async () => {
    const insert = vi.fn((row: Record<string, unknown>) => ({ row,
      select: () => ({ single: async () => ({ data: { id: "p1" }, error: null }) }),
    }));
    // publishCustomBoard now asks whether this account has ever published
    // before it writes anything — an empty "posts" table answers that.
    const from = vi.fn(() => ({
      insert,
      select: () => ({ eq: () => ({ limit: async () => ({ data: [] }) }) }),
    }));
    const supabase = { from } as unknown as SupabaseClient;

    await publishCustomBoard(supabase, board("  best  "), "  best  ", "");

    expect(from).toHaveBeenCalledWith("posts");
    // Trimmed on the way in, the way the feed's own publishing does it.
    expect(insert.mock.calls[0][0]).toMatchObject({ title: "best", category: "custom" });
  });
});

describe("the dialog that asks for the title", () => {
  it("offers the board's own name, so the usual case is one click", () => {
    render(<PublishBoardDialog boardTitle="My holiday photos" busy={false} onCancel={() => {}} onPublish={() => {}} />);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("My holiday photos");
  });

  it("will not publish a title the database would refuse", () => {
    const onPublish = vi.fn();
    render(<PublishBoardDialog boardTitle="ez" busy={false} onCancel={() => {}} onPublish={onPublish} />);

    const publish = screen.getByRole("button", { name: /publish/i });
    expect(publish).toHaveProperty("disabled", true);
    expect(screen.getByText("The title is too short.")).toBeTruthy();

    fireEvent.click(publish);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it("lets the same board through once the title is long enough", () => {
    const onPublish = vi.fn();
    render(<PublishBoardDialog boardTitle="ez" busy={false} onCancel={() => {}} onPublish={onPublish} />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "ez tier list" } });
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    expect(onPublish).toHaveBeenCalledWith("ez tier list", "");
  });
});
