import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { FeedPost, PostComment } from "@/lib/supabase/feed";

let viewer: { id: string } | null = { id: "post-owner" };

/** One comment by the post's own author, one by somebody else. */
const comments: PostComment[] = [
  {
    id: "c1",
    postId: "p1",
    userId: "post-owner",
    username: "postowner",
    displayName: "Post Owner",
    text: "my own comment",
    createdAt: "2026-08-24T19:43:24Z",
  },
  {
    id: "c2",
    postId: "p1",
    userId: "someone-else",
    username: "other",
    displayName: "Other",
    text: "not mine",
    createdAt: "2026-08-24T19:44:24Z",
  },
];

vi.mock("@/lib/supabase/feed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/feed")>()),
  deletePost: async () => true,
  getComments: async () => comments,
  getAuthorTitles: async () => new Map(),
  registerPostView: async () => {},
  addComment: async () => null,
}));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: viewer, loading: false }),
}));
vi.mock("@/components/profile/donate-button", () => ({ DonateButton: () => null }));
vi.mock("@/lib/utils/board-export", () => ({
  renderBoardPng: vi.fn(),
  downloadPng: vi.fn(),
}));

import { PostDialog } from "@/components/feed/post-dialog";

function post(): FeedPost {
  return {
    id: "p1",
    userId: "post-owner",
    username: "postowner",
    displayName: "Post Owner",
    title: "a tier list",
    description: "",
    category: "movie",
    viewsCount: 0,
    likesCount: 0,
    commentsCount: 2,
    isPublic: true,
    allowFork: true,
    donationUrl: null,
    createdAt: "2026-08-24T19:43:24Z",
  };
}

function open() {
  render(
    <PostDialog
      post={post()}
      titles={[]}
      onClose={vi.fn()}
      liked={false}
      onToggleLike={vi.fn()}
      onCommentAdded={vi.fn()}
      onDeleted={vi.fn()}
    />
  );
}

function openActionsMenu() {
  fireEvent.click(screen.getByRole("button", { name: /more post actions/i }));
}

beforeEach(() => {
  viewer = { id: "post-owner" };
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ ok: true }) }) as unknown as Response)
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("reporting a post", () => {
  it("is not offered to the author about their own post", () => {
    open();
    openActionsMenu();
    expect(screen.queryByRole("menuitem", { name: /^report$/i })).toBeNull();
  });

  it("is offered to anybody else", () => {
    viewer = { id: "someone-else" };
    open();
    openActionsMenu();
    expect(screen.getByRole("menuitem", { name: /^report$/i })).toBeTruthy();
  });

  it("sends the reason to the report route and shows it was filed", async () => {
    viewer = { id: "someone-else" };
    open();
    openActionsMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /^report$/i }));

    const textarea = await screen.findByPlaceholderText(/what is wrong with this/i);
    fireEvent.change(textarea, { target: { value: "Spam." } });
    fireEvent.click(screen.getByRole("button", { name: /send report/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/custom-reports",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ subjectType: "post", subjectId: "p1", reason: "Spam." }),
        })
      )
    );
    expect(await screen.findByText(/reported\. thank you/i)).toBeTruthy();
  });

  it("will not send a reason under three characters", async () => {
    viewer = { id: "someone-else" };
    open();
    openActionsMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /^report$/i }));

    const textarea = await screen.findByPlaceholderText(/what is wrong with this/i);
    fireEvent.change(textarea, { target: { value: "hi" } });

    expect((screen.getByRole("button", { name: /send report/i }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("reporting a comment", () => {
  it("is offered on somebody else's comment but not your own", async () => {
    open();
    // Wait for the async comment load to land before counting buttons.
    await screen.findByText(/not mine/i);

    // post-owner authored c1; only c2 (someone-else's) should carry the action.
    expect(screen.getAllByRole("button", { name: /report this comment/i })).toHaveLength(1);
  });

  it("reports that specific comment, not the post", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /report this comment/i }));

    const textarea = await screen.findByPlaceholderText(/what is wrong with this/i);
    fireEvent.change(textarea, { target: { value: "Off-topic." } });
    fireEvent.click(screen.getByRole("button", { name: /send report/i }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/custom-reports",
        expect.objectContaining({
          body: JSON.stringify({ subjectType: "post_comment", subjectId: "c2", reason: "Off-topic." }),
        })
      )
    );
  });
});
