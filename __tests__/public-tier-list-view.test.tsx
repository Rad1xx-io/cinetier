import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import type { PublicTierList } from "@/lib/supabase/profiles";

const getPublicTierList = vi.fn();
const trackSharedContentViewed = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/supabase/profiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/profiles")>()),
  getPublicTierList: (...a: unknown[]) => getPublicTierList(...a),
}));
vi.mock("@/lib/analytics/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/events")>()),
  trackSharedContentViewed: (...a: unknown[]) => trackSharedContentViewed(...a),
}));
vi.mock("@/lib/hooks/use-ranked-titles", () => ({
  useRankedTitles: () => ({ titles: [], reorderAll: vi.fn(), hydrated: true }),
}));
vi.mock("@/lib/hooks/use-ranked-channels", () => ({
  useRankedChannels: () => ({ channels: [], reorderAll: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: null, loading: false }),
}));

import { PublicTierListView } from "@/components/public-tier-list/public-tier-list-view";

function sample(): PublicTierList {
  return {
    profile: {
      id: "user-1",
      username: "anya",
      displayName: "Anya",
      isPublic: true,
      allowFork: true,
      donationUrl: null,
    },
    titles: [
      {
        tmdbId: 27205,
        mediaType: "movie",
        title: "Inception",
        posterPath: null,
        releaseDate: "2010-07-16",
        tier: "S",
        order: 0,
        voteAverage: 8.4,
        addedAt: 1,
        updatedAt: 2,
      },
    ],
    channels: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPublicTierList.mockResolvedValue(null);
});
afterEach(cleanup);

describe("server-provided data (getPublicTierListServer's initialData)", () => {
  it("renders the board on the very first render, then skips the client fetch entirely", async () => {
    render(<PublicTierListView username="anya" initialData={sample()} />);

    // No "loading" flash: this is what the crawler's raw HTML has to show.
    // getByTitle rather than getByText: the fork-conflict dialog (always in
    // the DOM, only toggled via native <dialog> open/close) carries its own
    // preview of the incoming title, so "Inception" is not unique text.
    expect(screen.getByTitle("Inception")).toBeTruthy();
    expect(screen.queryByText(/tier list not found/i)).toBeNull();

    // The effect still has to run to fire the analytics event below — wait
    // for that as the synchronisation point before asserting the negative.
    await waitFor(() =>
      expect(trackSharedContentViewed).toHaveBeenCalledWith("tier_list", "anya", "user-1")
    );
    expect(getPublicTierList).not.toHaveBeenCalled();
  });

  it("fires the viewed event exactly once, not once per render", async () => {
    render(<PublicTierListView username="anya" initialData={sample()} />);
    await waitFor(() => expect(trackSharedContentViewed).toHaveBeenCalledTimes(1));
  });
});

describe("no server data — the pre-SSR behaviour, unchanged", () => {
  it("falls back to the client fetch and renders once it resolves", async () => {
    getPublicTierList.mockResolvedValue(sample());
    render(<PublicTierListView username="anya" initialData={null} />);

    expect(await screen.findByTitle("Inception")).toBeTruthy();
    expect(getPublicTierList).toHaveBeenCalledWith("anya");
  });

  it("shows 'not found' once the client fetch resolves to nothing", async () => {
    getPublicTierList.mockResolvedValue(null);
    render(<PublicTierListView username="ghost" initialData={null} />);

    expect(await screen.findByText(/tier list not found/i)).toBeTruthy();
  });

  it("shows 'not found' the same way when the client fetch rejects outright", async () => {
    getPublicTierList.mockRejectedValue(new Error("network down"));
    render(<PublicTierListView username="ghost" initialData={null} />);

    expect(await screen.findByText(/tier list not found/i)).toBeTruthy();
  });
});
