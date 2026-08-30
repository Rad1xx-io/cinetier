import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { FeedPost } from "@/lib/supabase/feed";
import type { RankedTitle } from "@/lib/types";

const anime: RankedTitle = {
  tmdbId: 1,
  mediaType: "anime",
  title: "Anime X",
  posterPath: null,
  releaseDate: null,
  tier: "S",
  order: 0,
  addedAt: 0,
  updatedAt: 0,
};

const game: RankedTitle = {
  tmdbId: 2,
  mediaType: "game",
  title: "Game Y",
  posterPath: null,
  releaseDate: null,
  tier: "A",
  order: 0,
  addedAt: 0,
  updatedAt: 0,
};

vi.mock("@/lib/supabase/feed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/feed")>()),
  // The author's whole live board — every category mixed together. This is
  // what production actually returned once the dialog's own "give me the
  // full board" fetch landed, regardless of which post was open.
  getAuthorTitles: async () => [anime, game],
  getComments: async () => [],
  registerPostView: async () => {},
  addComment: async () => null,
}));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: null, loading: false }),
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
    userId: "author-1",
    username: "rad1xx",
    displayName: "Rad1xx",
    title: "Best Anime 2026",
    description: "",
    category: "anime",
    viewsCount: 0,
    likesCount: 0,
    commentsCount: 0,
    isPublic: true,
    allowFork: true,
    donationUrl: null,
    createdAt: "2026-08-29T19:43:44Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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

describe("PostDialog — the board once the author's full live board has loaded", () => {
  it("stays scoped to this post's snapshot, not the author's whole board", async () => {
    // Reproduces the real production report: a post's card showed only anime,
    // its dialog showed the author's whole mixed board (a game included) —
    // even though the post's own snapshot was correctly anime-only.
    render(
      <PostDialog
        post={post()}
        titles={[anime]}
        snapshot={[{ tmdbId: 1, mediaType: "anime", tier: "S", order: 0 }]}
        onClose={vi.fn()}
        liked={false}
        onToggleLike={vi.fn()}
        onCommentAdded={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    // Only printed once the board has rows, so waiting for it also waits past
    // the dialog's async "full board" fetch resolving.
    await screen.findByText(/1 title across one tier/i);

    expect(screen.getByText("Anime X")).toBeTruthy();
    expect(screen.queryByText("Game Y")).toBeNull();
  });

  it("falls back to the whole live board for a post published before snapshots existed", async () => {
    // undefined snapshot — resolveSnapshotTitles's documented meaning for a
    // pre-snapshot post — must still show everything, same as before this fix.
    render(
      <PostDialog
        post={post()}
        titles={[anime]}
        onClose={vi.fn()}
        liked={false}
        onToggleLike={vi.fn()}
        onCommentAdded={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    await screen.findByText(/2 titles across 2 tiers/i);

    expect(screen.getByText("Anime X")).toBeTruthy();
    expect(screen.getByText("Game Y")).toBeTruthy();
  });
});
