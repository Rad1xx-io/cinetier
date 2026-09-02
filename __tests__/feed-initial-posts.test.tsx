import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { FeedPost } from "@/lib/supabase/feed";

const getFeed = vi.fn(async () => []);
const getAuthorTitles = vi.fn(async () => []);
const getAuthorChannels = vi.fn(async () => []);
const getMyLikes = vi.fn(async () => new Set<string>());
const getPostSnapshots = vi.fn(async () => new Map());

vi.mock("@/lib/supabase/feed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/feed")>()),
  getFeed: (...args: unknown[]) => getFeed(...(args as [])),
  getAuthorTitles: (...args: unknown[]) => getAuthorTitles(...(args as [])),
  getAuthorChannels: (...args: unknown[]) => getAuthorChannels(...(args as [])),
  getMyLikes: (...args: unknown[]) => getMyLikes(...(args as [])),
  getPostSnapshots: (...args: unknown[]) => getPostSnapshots(...(args as [])),
}));
vi.mock("@/lib/supabase/custom-lists", () => ({
  getPublishedBoards: async () => new Map(),
}));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => null }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: null, loading: false }),
}));

import { FeedView } from "@/components/feed/feed-view";

function fakePost(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-1",
    userId: "user-1",
    username: "anya",
    displayName: "Anya",
    title: "My favourite films",
    description: "",
    category: "movie",
    viewsCount: 0,
    likesCount: 0,
    commentsCount: 0,
    isPublic: true,
    allowFork: true,
    donationUrl: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("initialPosts — getInitialFeed's server snapshot of the All tab", () => {
  it("renders it on the very first render and never calls getFeed for that paint", async () => {
    render(<FeedView initialPosts={[fakePost()]} />);

    // No Skeleton flash: this is what a crawler's raw HTML has to carry.
    expect(screen.getByText("My favourite films")).toBeTruthy();

    // The effect still has to run the enrichment queries — wait for one as
    // the synchronisation point before asserting the negative below.
    await waitFor(() => expect(getAuthorTitles).toHaveBeenCalledWith(["user-1"]));
    expect(getFeed).not.toHaveBeenCalled();
  });

  it("still runs the client enrichment queries against the server-provided posts", async () => {
    render(<FeedView initialPosts={[fakePost()]} />);

    await waitFor(() => {
      expect(getAuthorTitles).toHaveBeenCalledWith(["user-1"]);
      expect(getAuthorChannels).toHaveBeenCalledWith(["user-1"]);
      expect(getMyLikes).toHaveBeenCalledWith(["post-1"]);
      expect(getPostSnapshots).toHaveBeenCalledWith(["post-1"]);
    });
  });

  it("shows the empty state immediately for a confirmed-empty server feed, not a skeleton first", async () => {
    render(<FeedView initialPosts={[]} />);

    expect(screen.getByText(/nothing here yet/i)).toBeTruthy();
    expect(getFeed).not.toHaveBeenCalled();
  });

  it("still calls getFeed when the visitor switches to a different tab", async () => {
    render(<FeedView initialPosts={[fakePost()]} />);
    await waitFor(() => expect(getAuthorTitles).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Films" }));

    await waitFor(() => expect(getFeed).toHaveBeenCalledWith({ category: "movie" }));
  });

  it("refetches rather than reusing the frozen snapshot when the visitor returns to All", async () => {
    render(<FeedView initialPosts={[fakePost()]} />);
    await waitFor(() => expect(getAuthorTitles).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Films" }));
    await waitFor(() => expect(getFeed).toHaveBeenCalledWith({ category: "movie" }));

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(getFeed).toHaveBeenCalledWith({}));
  });
});

describe("no initialPosts — unchanged from before this prop existed", () => {
  it("calls getFeed for the All tab on mount, exactly as before", async () => {
    render(<FeedView />);
    await waitFor(() => expect(getFeed).toHaveBeenCalledWith({}));
  });
});
