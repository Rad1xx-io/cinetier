import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildSnapshot, type PublishedBoard } from "@/lib/supabase/custom-lists";
import { CustomPostBoard } from "@/components/feed/custom-post-board";

afterEach(cleanup);

describe("the snapshot taken when a board is published", () => {
  it("records the shape and no pictures at all", () => {
    const snapshot = buildSnapshot(
      [
        { id: "row-a", listId: "l", position: 1, label: "A", color: "#f59e0b", imagePath: "rows/a.jpg", imageUrl: "https://x/a" },
        { id: "row-s", listId: "l", position: 0, label: "S", color: "#ef4444", imagePath: null, imageUrl: null },
      ],
      [
        { id: "i2", listId: "l", rowId: "row-a", position: 1, caption: "second", imagePath: "cards/2.jpg", imageUrl: "https://x/2", hiddenAt: null },
        { id: "i1", listId: "l", rowId: "row-s", position: 0, caption: "first", imagePath: "cards/1.jpg", imageUrl: "https://x/1", hiddenAt: null },
      ]
    );

    expect(snapshot.rows.map((r) => r.label)).toEqual(["S", "A"]);
    expect(snapshot.items.map((i) => i.caption)).toEqual(["first", "second"]);

    // The whole design rests on this: no path, no url, nothing that could
    // outlive a takedown. A card is a reference to be looked up later.
    const serialised = JSON.stringify(snapshot);
    expect(serialised).not.toContain("cards/1.jpg");
    expect(serialised).not.toContain("rows/a.jpg");
    expect(serialised).not.toContain("https://x/");
  });
});

function published(withPictures: boolean[]): PublishedBoard {
  return {
    postId: "p1",
    listId: "l1",
    rows: [{ id: "row-s", label: "S", color: "#ef4444", position: 0 }],
    items: withPictures.map((has, index) => ({
      id: `i${index}`,
      rowId: "row-s",
      position: index,
      caption: `card ${index}`,
      imageUrl: has ? `https://example.test/signed-${index}.jpg?token=t` : null,
    })),
  };
}

describe("a published board in the feed", () => {
  it("shows the pictures that are still available", () => {
    render(<CustomPostBoard board={published([true, true])} />);
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("leaves a gap where a card has been taken down, without reflowing the rest", () => {
    // The middle card resolved to nothing — hidden by its owner, blocked, or
    // deleted since publication. The post was frozen with three cards in this
    // tier and still says so.
    const { container } = render(<CustomPostBoard board={published([true, false, true])} />);

    expect(screen.getAllByRole("img")).toHaveLength(2);
    const row = container.querySelector(".flex-1")!;
    expect(row.children).toHaveLength(3);
    expect(row.querySelector("[title='This picture is no longer available']")).not.toBeNull();
  });

  it("says a tier is empty rather than dropping it out of the board", () => {
    render(<CustomPostBoard board={{ ...published([]), items: [] }} />);
    expect(screen.getByText("Empty")).toBeTruthy();
  });
});

describe("the feed card for a board of photographs", () => {
  it("renders the published snapshot instead of the author's ranked titles", async () => {
    vi.doMock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
    const { PostCard } = await import("@/components/feed/post-card");

    render(
      <PostCard
        post={{
          id: "p1", userId: "u1", username: "someone", displayName: null,
          title: "Holiday photos", description: "", category: "custom",
          viewsCount: 0, likesCount: 0, commentsCount: 0,
          isPublic: true, allowFork: false, donationUrl: null,
          createdAt: "2026-08-24T00:00:00Z",
        }}
        titles={[]}
        published={published([true])}
        liked={false}
        onOpen={() => {}}
        onToggleLike={() => {}}
      />
    );

    // The "not published their list" empty state belongs to the ranked-titles
    // path and must not appear for a board that plainly has content.
    expect(screen.queryByText(/has not published their list/)).toBeNull();
    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
    expect(screen.getByText("Photos")).toBeTruthy();
  });
});
