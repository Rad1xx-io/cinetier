import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { FeedPost } from "@/lib/supabase/feed";

const deletePost = vi.fn(async () => true);
const renderBoardPng = vi.fn<(node: HTMLElement) => Promise<string>>(
  async () => "data:image/png;base64,stub"
);
const downloadPng = vi.fn();
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
vi.mock("@/lib/utils/board-export", () => ({
  renderBoardPng: (node: HTMLElement) => renderBoardPng(node),
  downloadPng: (...args: unknown[]) => downloadPng(...(args as [])),
}));

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
        items: [{ id: "i1", rowId: "r1", position: 0, caption: "a card", imageUrl: null }],
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

/** "Delete post" moved behind the overflow menu; every test that reaches for
 *  it now has to open the menu first, the way a person would. */
function openActionsMenu() {
  fireEvent.click(screen.getByRole("button", { name: /more post actions/i }));
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
    openActionsMenu();
    expect(screen.getByRole("menuitem", { name: /delete post/i })).toBeTruthy();
  });

  it("is not offered to anybody else", () => {
    viewer = { id: "someone-else" };
    open();
    openActionsMenu();
    expect(screen.queryByRole("menuitem", { name: /delete post/i })).toBeNull();
  });

  it("is not offered to a visitor who is not signed in", () => {
    viewer = null;
    open();
    openActionsMenu();
    expect(screen.queryByRole("menuitem", { name: /delete post/i })).toBeNull();
  });

  it("asks first, and does nothing when the answer is no", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const onDeleted = open();
    openActionsMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /delete post/i }));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(deletePost).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("says the board itself is not touched, because that is the fear", async () => {
    const asked = vi.fn((_message?: string) => false);
    vi.stubGlobal("confirm", asked);
    open();
    openActionsMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /delete post/i }));

    await waitFor(() => expect(asked).toHaveBeenCalled());
    expect(String(asked.mock.calls[0]?.[0])).toMatch(/board itself is not touched/i);
  });

  it("removes it and tells the feed once the answer is yes", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const onDeleted = open();
    openActionsMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /delete post/i }));

    await waitFor(() => expect(deletePost).toHaveBeenCalledWith("p1"));
    expect(onDeleted).toHaveBeenCalledWith("p1");
  });

  it("keeps the post in the feed when the delete fails", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    deletePost.mockResolvedValueOnce(false);
    const onDeleted = open();
    openActionsMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /delete post/i }));

    await waitFor(() => expect(deletePost).toHaveBeenCalled());
    // Nothing was removed, so the feed must not be told that it was.
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("downloading a post as a picture", () => {
  it("is offered to any visitor, not only the author", () => {
    viewer = null;
    open();
    openActionsMenu();
    expect(screen.getByRole("menuitem", { name: /^download$/i })).toBeTruthy();
  });

  it("sits in the same menu as Delete post, both behind one trigger", () => {
    open();
    openActionsMenu();
    expect(screen.getByRole("menuitem", { name: /^download$/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /delete post/i })).toBeTruthy();
  });

  it("rasterises the board that is actually on screen and saves it", async () => {
    open();
    openActionsMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /^download$/i }));

    await waitFor(() => expect(renderBoardPng).toHaveBeenCalledTimes(1));
    // Whatever DOM node it was handed is the board section rendered a moment
    // ago — the frozen shape merged with live pictures, the same board a
    // viewer is already looking at, not a second copy fetched specially.
    expect(renderBoardPng.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
    await waitFor(() => expect(downloadPng).toHaveBeenCalledWith("data:image/png;base64,stub", "tierlistonline"));
  });

  it("reveals the watermark only for the moment of the capture", async () => {
    let opacityDuringCapture = "";
    renderBoardPng.mockImplementationOnce(async (node: HTMLElement) => {
      opacityDuringCapture = node.querySelector<HTMLElement>("[data-export-watermark]")?.style.opacity ?? "";
      return "data:image/png;base64,stub";
    });

    open();
    openActionsMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /^download$/i }));

    await waitFor(() => expect(renderBoardPng).toHaveBeenCalled());
    expect(opacityDuringCapture).toBe("1");

    const watermark = document.querySelector<HTMLElement>("[data-export-watermark]");
    await waitFor(() => expect(watermark?.style.opacity).toBe("0"));
  });
});
