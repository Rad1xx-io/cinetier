import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { RankedTitle } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";

let titlesState: { titles: RankedTitle[]; hydrated: boolean } = { titles: [], hydrated: false };
let channelsState: { channels: RankedChannel[]; hydrated: boolean } = {
  channels: [],
  hydrated: false,
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/hooks/use-ranked-titles", () => ({
  useRankedTitles: () => ({
    titles: titlesState.titles,
    hydrated: titlesState.hydrated,
    remove: vi.fn(),
    setTier: vi.fn(),
    reorderAll: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-ranked-channels", () => ({
  useRankedChannels: () => ({
    channels: channelsState.channels,
    hydrated: channelsState.hydrated,
    remove: vi.fn(),
    setTier: vi.fn(),
    reorderAll: vi.fn(),
  }),
}));

import { TierListBoard } from "@/components/tier-list/tier-list-board";
import { ChannelTierListBoard } from "@/components/youtube-tier-list/channel-tier-list-board";

function title(over: Partial<RankedTitle> = {}): RankedTitle {
  return {
    tmdbId: 1,
    mediaType: "movie",
    title: "A title",
    posterPath: null,
    releaseDate: "2020-01-01",
    tier: "S",
    order: 0,
    addedAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function channel(over: Partial<RankedChannel> = {}): RankedChannel {
  return {
    channelId: "c1",
    title: "A channel",
    thumbnailUrl: null,
    country: null,
    tier: "S",
    order: 0,
    addedAt: 0,
    updatedAt: 0,
    ...over,
  };
}

beforeEach(() => {
  titlesState = { titles: [], hydrated: false };
  channelsState = { channels: [], hydrated: false };
});
afterEach(cleanup);

/*
 * lib/seo/site.ts lists /tier-list and /youtube/tier-list in SITEMAP_ROUTES on
 * the reasoning that a signed-out visitor sees "a real landing page rather
 * than a dead one" — EmptyState/ChannelEmptyState. Before this fix, the
 * pre-hydration render (which is what a crawler's raw HTML actually is) sent
 * a wordless Skeleton instead, so that promise never reached the page anyone
 * without JavaScript can read. These tests pin the fix: the exact same real
 * copy has to render whether hydration hasn't happened yet or has happened
 * and genuinely found nothing.
 */
describe("TierListBoard — the /tier-list landing page from SITEMAP_ROUTES, before hydration too", () => {
  it("renders the real EmptyState before hydration, not a wordless Skeleton", () => {
    render(<TierListBoard />);

    expect(screen.getByText("Your tier list is empty")).toBeTruthy();
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });

  it("renders the exact same EmptyState once hydrated with nothing ranked", () => {
    titlesState = { titles: [], hydrated: true };
    channelsState = { channels: [], hydrated: true };
    render(<TierListBoard />);

    expect(screen.getByText("Your tier list is empty")).toBeTruthy();
  });

  it("shows the real board, not EmptyState, once hydration lands with something ranked", () => {
    titlesState = { titles: [title()], hydrated: true };
    channelsState = { channels: [], hydrated: true };
    render(<TierListBoard />);

    expect(screen.queryByText("Your tier list is empty")).toBeNull();
    expect(screen.getByRole("heading", { name: "Tier list" })).toBeTruthy();
  });
});

describe("ChannelTierListBoard — the /youtube/tier-list landing page, before hydration too", () => {
  it("renders the real ChannelEmptyState before hydration, not a wordless Skeleton", () => {
    render(<ChannelTierListBoard />);

    expect(screen.getByText("Nothing here yet")).toBeTruthy();
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });

  it("renders the exact same ChannelEmptyState once hydrated with nothing ranked", () => {
    channelsState = { channels: [], hydrated: true };
    render(<ChannelTierListBoard />);

    expect(screen.getByText("Nothing here yet")).toBeTruthy();
  });

  it("shows the real board, not ChannelEmptyState, once hydration lands with something ranked", () => {
    channelsState = { channels: [channel()], hydrated: true };
    render(<ChannelTierListBoard />);

    expect(screen.queryByText("Nothing here yet")).toBeNull();
    expect(screen.getByRole("heading", { name: "YouTube channel tier list" })).toBeTruthy();
  });
});
