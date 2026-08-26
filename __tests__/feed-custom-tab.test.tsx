import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const getFeed = vi.fn(async () => []);

vi.mock("@/lib/supabase/feed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/feed")>()),
  getFeed: (...args: unknown[]) => getFeed(...(args as [])),
  getAuthorTitles: async () => [],
  getMyLikes: async () => new Set(),
  getPostSnapshots: async () => new Map(),
}));
vi.mock("@/lib/supabase/custom-lists", () => ({
  getPublishedBoards: async () => new Map(),
}));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => null }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: null, loading: false }),
}));

import { FeedView } from "@/components/feed/feed-view";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("a tab for boards of photographs", () => {
  it("sits alongside the catalogue tabs, a showcase rather than a filter on moderation", async () => {
    render(<FeedView />);
    await waitFor(() => expect(getFeed).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Custom" })).toBeTruthy();
  });

  it("asks the feed for custom posts specifically once selected", async () => {
    render(<FeedView />);
    await waitFor(() => expect(getFeed).toHaveBeenCalledWith({}));

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    await waitFor(() =>
      expect(getFeed).toHaveBeenLastCalledWith({ category: "custom" })
    );
  });
});
