import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { RankedTitle } from "@/lib/types";
import type { CustomBoard as Board } from "@/lib/types/custom-list";

/*
 * One event, two surfaces that can fire it — the funnel question is "did this
 * person do anything that shares their board", not which button they pressed.
 *
 * vi.mock calls are hoisted to the top of the module regardless of where they
 * are written, so every mock below applies across the whole file — kept here,
 * together, rather than scattered inside the describes that use them.
 */

const trackPostSharedLink = vi.fn();
const trackLinkCopied = vi.fn();
const setBoardVisibility = vi.fn(async () => {});

vi.mock("@/lib/analytics/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/events")>()),
  trackPostSharedLink: (...args: unknown[]) => trackPostSharedLink(...(args as [])),
  trackLinkCopied: (...args: unknown[]) => trackLinkCopied(...(args as [])),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: { id: "u1" }, loading: false }),
}));
vi.mock("@/lib/supabase/profiles", () => ({
  getMyProfile: async () => ({ username: "rad1xx", isPublic: true }),
}));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("@/lib/supabase/custom-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/custom-lists")>()),
  setBoardVisibility: (...args: unknown[]) => setBoardVisibility(...(args as [])),
}));

import { TierListActions } from "@/components/tier-list/tier-list-actions";
import { CustomBoard } from "@/components/custom-list/custom-board";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("post_shared_link — copying a tier list's own link", () => {
  function title(): RankedTitle {
    return {
      tmdbId: 1,
      mediaType: "movie",
      title: "A film",
      posterPath: null,
      releaseDate: "2020-01-01",
      tier: "S",
      order: 0,
      addedAt: 0,
      updatedAt: 0,
    };
  }

  async function renderWithClaimedProfile() {
    const boardRef = { current: null };
    render(
      <TierListActions
        boardRef={boardRef}
        onNotify={() => {}}
        titles={[title()]}
        channels={[]}
        category="movie"
      />
    );
    // The username loads asynchronously via getMyProfile; wait for the menu
    // trigger so the profile fetch has had a turn to resolve.
    await waitFor(() => screen.getByRole("button", { name: "More list actions" }));
  }

  it("fires alongside link_copied when Copy link is used", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
    await renderWithClaimedProfile();

    fireEvent.click(screen.getByRole("button", { name: "More list actions" }));
    await waitFor(() => expect(screen.getByRole("menu")).toBeTruthy());
    fireEvent.click(screen.getByText("Copy link"));

    await waitFor(() => expect(trackLinkCopied).toHaveBeenCalled());
    expect(trackPostSharedLink).toHaveBeenCalledWith("tier_list");
  });
});

describe("post_shared_link — a custom board turning shareable", () => {
  function board(isPublic: boolean): Board {
    return {
      list: { id: "l1", userId: "u1", title: "Board", isPublic, hiddenAt: null, updatedAt: "2026-01-01" },
      rows: [{ id: "r1", listId: "l1", position: 0, label: "S", color: "#ef4444", imagePath: null, imageUrl: null }],
      items: [],
      canEdit: true,
      allowFork: false,
    };
  }

  async function openBoardMenu(isPublic: boolean) {
    render(<CustomBoard board={board(isPublic)} />);
    fireEvent.click(screen.getByRole("button", { name: "More board actions" }));
    await waitFor(() => expect(screen.getByRole("menu")).toBeTruthy());
  }

  it("fires when a private board is switched to 'Anyone with the link'", async () => {
    await openBoardMenu(false);

    // Private, so the item reads "Only me" and clicking it turns the board
    // public — the direction that is actually a share.
    fireEvent.click(screen.getByText("Only me"));

    await waitFor(() => expect(setBoardVisibility).toHaveBeenCalledWith(expect.anything(), "l1", true));
    expect(trackPostSharedLink).toHaveBeenCalledWith("custom_board");
  });

  it("does not fire the other way — turning a public board private is not a share", async () => {
    await openBoardMenu(true);

    // Public, so the item reads "Anyone with the link"; clicking it here is
    // the opposite of sharing.
    fireEvent.click(screen.getByText("Anyone with the link"));

    await waitFor(() => expect(setBoardVisibility).toHaveBeenCalledWith(expect.anything(), "l1", false));
    expect(trackPostSharedLink).not.toHaveBeenCalled();
  });
});
