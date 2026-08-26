import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { RankedTitle } from "@/lib/types";
import type { ContentType } from "@/lib/utils/content-type";

const reorderAll = vi.fn();
const getRatedTitles = vi.fn();
const clearAllChannels = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: null, loading: false }),
}));
vi.mock("@/lib/supabase/profiles", () => ({ getMyProfile: async () => null }));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  reorderAll: (...a: unknown[]) => reorderAll(...(a as [])),
  getRatedTitles: () => getRatedTitles(),
}));
vi.mock("@/lib/storage/youtube", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/youtube")>()),
  clearAllChannels: (...a: unknown[]) => clearAllChannels(...(a as [])),
}));

import { TierListActions } from "@/components/tier-list/tier-list-actions";

function title(mediaType: RankedTitle["mediaType"], index: number): RankedTitle {
  return {
    tmdbId: index,
    mediaType,
    title: `${mediaType} ${index}`,
    posterPath: null,
    releaseDate: "2020-01-01",
    tier: "S",
    order: index,
    addedAt: 0,
    updatedAt: 0,
  };
}

function renderActions(opts: { titles: RankedTitle[]; channels?: number; category: ContentType }) {
  getRatedTitles.mockReturnValue(opts.titles);
  const boardRef = { current: null };
  return render(
    <TierListActions
      boardRef={boardRef}
      onNotify={() => {}}
      titles={opts.titles}
      channels={Array.from({ length: opts.channels ?? 0 }, (_, i) => ({ id: `c${i}` })) as never}
      category={opts.category}
    />
  );
}

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "More list actions" }));
  await waitFor(() => expect(screen.getByRole("menu")).toBeTruthy());
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a second entry point into your own boards", () => {
  it("offers a visible Custom button, not tucked behind the overflow menu", () => {
    renderActions({ titles: [title("movie", 0)], category: "movie" });
    const link = screen.getByRole("link", { name: /custom/i });
    expect(link.getAttribute("href")).toBe("/custom");
    // Visible means: not inside the closed menu panel.
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

/*
 * The production report: looking at the Films tab, "Clear list" removed
 * every category at once and said "all 52 titles" to someone looking at one
 * of them. There is no board-wide view on this page to fall back to — the
 * picker always shows exactly one catalog — so Clear List is scoped to
 * whichever one is on screen, every time, not only when a filter "happens"
 * to be active.
 */
describe("Clear List is scoped to the catalog on screen", () => {
  const mixed = [
    title("movie", 0),
    title("movie", 1),
    title("movie", 2),
    title("tv", 3),
    title("tv", 4),
  ];

  it("is not offered when the active catalog is empty, even with other catalogs stocked", async () => {
    // The bug in one line: the old check was titles.length + channels.length,
    // which stayed true here even though Anime itself has nothing to clear.
    renderActions({ titles: mixed, category: "anime" });
    await openMenu();
    expect(screen.queryByText("Clear list")).toBeNull();
  });

  it("names the active catalog and its own count, not the whole board's", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    renderActions({ titles: mixed, category: "movie" });
    await openMenu();

    fireEvent.click(screen.getByText("Clear list"));

    // Three Films, not five titles across both catalogs.
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("3 Film titles"));
    expect(window.confirm).not.toHaveBeenCalledWith(expect.stringContaining("5"));
  });

  it("does nothing on a decline", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    renderActions({ titles: mixed, category: "movie" });
    await openMenu();

    fireEvent.click(screen.getByText("Clear list"));

    expect(reorderAll).not.toHaveBeenCalled();
  });

  it("removes only the active catalog's titles and leaves the rest exactly as they were", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderActions({ titles: mixed, category: "movie" });
    await openMenu();

    fireEvent.click(screen.getByText("Clear list"));

    expect(reorderAll).toHaveBeenCalledTimes(1);
    const survivors = reorderAll.mock.calls[0][0] as RankedTitle[];
    expect(survivors.map((t) => t.mediaType)).toEqual(["tv", "tv"]);
    expect(survivors).toEqual(mixed.filter((t) => t.mediaType === "tv"));
  });

  it("re-reads the store rather than clearing whatever it rendered with", async () => {
    // What "not cached" means concretely: between mount and the click, three
    // more Films were ranked from elsewhere in the app. The dialog and the
    // write both have to see that, not the five titles this component was
    // first handed as props.
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderActions({ titles: mixed, category: "movie" });
    getRatedTitles.mockReturnValue([...mixed, title("movie", 5), title("movie", 6)]);
    await openMenu();

    fireEvent.click(screen.getByText("Clear list"));

    const survivors = reorderAll.mock.calls[0][0] as RankedTitle[];
    expect(survivors.map((t) => t.mediaType)).toEqual(["tv", "tv"]);
  });

  it("on YouTube, clears channels and leaves every title untouched", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderActions({ titles: mixed, channels: 4, category: "youtube" });
    await openMenu();

    fireEvent.click(screen.getByText("Clear list"));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("4 YouTube channels"));
    expect(clearAllChannels).toHaveBeenCalledTimes(1);
    expect(reorderAll).not.toHaveBeenCalled();
  });

  it("uses the singular for exactly one", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    renderActions({ titles: [title("game", 0)], category: "game" });
    await openMenu();

    fireEvent.click(screen.getByText("Clear list"));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("1 Game title "));
  });
});
