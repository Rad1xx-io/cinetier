import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { FeedPost } from "@/lib/supabase/feed";

const deletePost = vi.fn(async () => true);
let viewer: { id: string } | null = { id: "author-1" };

vi.mock("@/lib/supabase/feed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/feed")>()),
  deletePost: (...args: unknown[]) => deletePost(...(args as [])),
  getComments: async () => [],
  getAuthorTitles: async () => new Map(),
  registerPostView: async () => {},
  addComment: async () => null,
}));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: viewer, loading: false }),
}));
vi.mock("@/components/profile/donate-button", () => ({ DonateButton: () => null }));

import { PostDialog } from "@/components/feed/post-dialog";

function post(): FeedPost {
  return {
    id: "p1",
    userId: "author-1",
    username: "rad1xx",
    displayName: "Rad1xx",
    title: "test",
    description: "",
    category: "custom",
    viewsCount: 0,
    likesCount: 0,
    commentsCount: 0,
    isPublic: true,
    allowFork: true,
    donationUrl: null,
    createdAt: "2026-08-24T19:43:24Z",
  };
}

function open(onDeleted = vi.fn()) {
  render(
    <PostDialog
      post={post()}
      titles={[]}
      published={{
        postId: "p1",
        listId: "l1",
        rows: [{ id: "r1", label: "S", color: "#ef4444", position: 0 }],
        items: [],
      }}
      liked={false}
      onClose={vi.fn()}
      onToggleLike={vi.fn()}
      onCommentAdded={vi.fn()}
      onDeleted={onDeleted}
    />
  );
  return onDeleted;
}

beforeEach(() => {
  viewer = { id: "author-1" };
  vi.clearAllMocks();
  /*
   * jsdom knows the dialog element but implements neither of the methods that
   * open and close it, so the component throws on mount. Nothing about the
   * behaviour under test depends on modal semantics — only on the dialog being
   * in the document — so the attribute they toggle is enough.
   */
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("taking a post back out of the feed", () => {
  it("is offered to the author", () => {
    open();
    expect(screen.getByRole("button", { name: /delete post/i })).toBeTruthy();
  });

  it("is not offered to anybody else", () => {
    viewer = { id: "someone-else" };
    open();
    expect(screen.queryByRole("button", { name: /delete post/i })).toBeNull();
  });

  it("is not offered to a visitor who is not signed in", () => {
    viewer = null;
    open();
    expect(screen.queryByRole("button", { name: /delete post/i })).toBeNull();
  });

  it("asks first, and does nothing when the answer is no", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const onDeleted = open();

    fireEvent.click(screen.getByRole("button", { name: /delete post/i }));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(deletePost).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("says the board itself is not touched, because that is the fear", async () => {
    const asked = vi.fn((_message?: string) => false);
    vi.stubGlobal("confirm", asked);
    open();

    fireEvent.click(screen.getByRole("button", { name: /delete post/i }));

    await waitFor(() => expect(asked).toHaveBeenCalled());
    expect(String(asked.mock.calls[0]?.[0])).toMatch(/board itself is not touched/i);
  });

  it("removes it and tells the feed once the answer is yes", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const onDeleted = open();

    fireEvent.click(screen.getByRole("button", { name: /delete post/i }));

    await waitFor(() => expect(deletePost).toHaveBeenCalledWith("p1"));
    expect(onDeleted).toHaveBeenCalledWith("p1");
  });

  it("keeps the post in the feed when the delete fails", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    deletePost.mockResolvedValueOnce(false);
    const onDeleted = open();

    fireEvent.click(screen.getByRole("button", { name: /delete post/i }));

    await waitFor(() => expect(deletePost).toHaveBeenCalled());
    // Nothing was removed, so the feed must not be told that it was.
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
