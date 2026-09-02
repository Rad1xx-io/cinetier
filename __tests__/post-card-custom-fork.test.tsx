import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PostCard } from "@/components/feed/post-card";
import type { FeedPost } from "@/lib/supabase/feed";
import type { PublishedBoard } from "@/lib/supabase/custom-lists";

afterEach(cleanup);

function post(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "p1",
    userId: "u1",
    username: "someone",
    displayName: null,
    title: "Holiday photos",
    description: "",
    category: "custom",
    viewsCount: 0,
    likesCount: 0,
    commentsCount: 0,
    isPublic: true,
    allowFork: true,
    donationUrl: null,
    createdAt: "2026-08-24T00:00:00Z",
    ...overrides,
  };
}

function board(): PublishedBoard {
  return {
    postId: "p1",
    listId: "board-1",
    rows: [{ id: "r1", label: "S", color: "#ef4444", position: 0 }],
    items: [{ id: "i1", rowId: "r1", position: 0, caption: "a card", imageUrl: null }],
  };
}

/*
 * A regular post's Fork link points at the author's live profile
 * (/u/[username]), where the thing being copied — ranked_titles — actually
 * lives. Nothing about that is true for a board of photographs: the post's
 * own board is the source, not the author's profile, and the pictures on it
 * are somebody else's upload rather than a catalogue reference. This is the
 * gate that used to read `post.category !== "custom"` and refuse the whole
 * category outright.
 */
describe("forking a post made from a Custom board", () => {
  it("links to the board's own page, not the author's profile", () => {
    render(
      <PostCard
        post={post()}
        titles={[]}
        published={board()}
        liked={false}
        onOpen={() => {}}
        onToggleLike={() => {}}
      />
    );

    const fork = screen.getByRole("link", { name: /fork/i });
    expect(fork.getAttribute("href")).toBe("/custom/board-1");
  });

  it("is not offered when the author has forking turned off", () => {
    render(
      <PostCard
        post={post({ allowFork: false })}
        titles={[]}
        published={board()}
        liked={false}
        onOpen={() => {}}
        onToggleLike={() => {}}
      />
    );

    expect(screen.queryByRole("link", { name: /fork/i })).toBeNull();
  });

  it("is not offered when the post has no resolvable board to send anyone to", () => {
    // A pre-migration post, or a board deleted out from under its post —
    // there is nowhere for the link to go.
    render(
      <PostCard
        post={post()}
        titles={[]}
        published={undefined}
        liked={false}
        onOpen={() => {}}
        onToggleLike={() => {}}
      />
    );

    expect(screen.queryByRole("link", { name: /fork/i })).toBeNull();
  });

  it("does not gate on the author's profile visibility — that flag means something else here", () => {
    // isPublic is the AUTHOR'S profile visibility, not the board's. A custom
    // post with a public board and a private profile is a real, valid
    // combination, and must still offer a fork.
    render(
      <PostCard
        post={post({ isPublic: false })}
        titles={[]}
        published={board()}
        liked={false}
        onOpen={() => {}}
        onToggleLike={() => {}}
      />
    );

    expect(screen.getByRole("link", { name: /fork/i })).toBeTruthy();
  });
});

describe("forking a regular post still works exactly as before", () => {
  it("links to the author's profile, unaffected by the custom-board change", () => {
    render(
      <PostCard
        post={post({ category: "movie" })}
        titles={[]}
        liked={false}
        onOpen={() => {}}
        onToggleLike={() => {}}
      />
    );

    const fork = screen.getByRole("link", { name: /fork/i });
    expect(fork.getAttribute("href")).toBe("/u/someone");
  });
});
