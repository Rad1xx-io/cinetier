import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { POST_CATEGORIES, type FeedPost } from "@/lib/supabase/feed";
import { PostCard } from "@/components/feed/post-card";

afterEach(cleanup);

/** The categories the database will actually accept, read from the migration. */
function categoriesAllowedByTheDatabase(): string[] {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/013_custom_list_publications.sql"),
    "utf8"
  );
  const constraint = sql.match(/posts_category_check[\s\S]*?check \(category in \(([^)]*)\)\)/);
  if (!constraint) throw new Error("posts_category_check is not in migration 013 any more");
  return [...constraint[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
}

describe("the categories a post can have", () => {
  it("are the same set in the code as in the database", () => {
    // The bug this catches: `custom` was added to the type and to the database
    // but not to the list the code validates against, so every custom post was
    // relabelled `mixed` on its way out — and a shorter array is still a valid
    // PostCategory[], so nothing complained.
    expect([...POST_CATEGORIES].sort()).toEqual(categoriesAllowedByTheDatabase());
  });

  it("include the one a board of photographs uses", () => {
    expect(POST_CATEGORIES).toContain("custom");
  });
});

function post(category: string): FeedPost {
  return {
    id: "p1",
    userId: "u1",
    username: "rad1xx",
    displayName: "Rad1xx",
    title: "test",
    description: "",
    category: category as FeedPost["category"],
    viewsCount: 0,
    likesCount: 0,
    commentsCount: 0,
    isPublic: true,
    allowFork: true,
    donationUrl: null,
    createdAt: "2026-08-24T19:43:24Z",
  };
}

describe("a post made from a board of photographs", () => {
  it("is labelled as photographs, not as a film list", () => {
    render(
      <PostCard
        post={post("custom")}
        titles={[]}
        published={{
          postId: "p1",
          listId: "l1",
          rows: [{ id: "r1", label: "S", color: "#ef4444", position: 0 }],
          items: [{ id: "i1", rowId: "r1", position: 0, caption: "a card", imageUrl: null }],
        }}
        liked={false}
        onToggleLike={vi.fn()}
        onOpen={vi.fn()}
      />
    );

    expect(screen.getByText("Photos")).toBeTruthy();
    // The placeholder belongs to authors with no ranked titles, and says
    // something untrue about somebody who published a board of their own.
    expect(screen.queryByText(/has not published/i)).toBeNull();
    expect(screen.getByText("S")).toBeTruthy();
  });
});
