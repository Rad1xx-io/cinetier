import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { RankedTitle } from "@/lib/types";

const onNotify = vi.fn();

// A signed-in user, unlike the sibling suite in
// tier-list-actions-custom-clear.test.tsx: the empty-board refusal sits right
// behind the sign-in check, and testing it with a signed-out session would
// only prove the sign-in message wins, which is a different, already-covered
// behaviour.
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: { id: "u1" }, loading: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/supabase/profiles", () => ({ getMyProfile: async () => null }));

import { TierListActions } from "@/components/tier-list/tier-list-actions";

function title(mediaType: RankedTitle["mediaType"] = "movie"): RankedTitle {
  return {
    tmdbId: 1,
    mediaType,
    title: "A title",
    posterPath: null,
    releaseDate: "2020-01-01",
    tier: "S",
    order: 0,
    addedAt: 0,
    updatedAt: 0,
  };
}

function renderActions(titles: RankedTitle[]) {
  const boardRef = { current: null };
  return render(
    <TierListActions
      boardRef={boardRef}
      onNotify={onNotify}
      titles={titles}
      channels={[]}
      category="movie"
    />
  );
}

function clickPublish() {
  fireEvent.click(screen.getByRole("button", { name: /publish/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // The dialog is always in the tree (TierListActions renders it
  // unconditionally); "open" is native <dialog> behaviour via showModal/close,
  // which jsdom does not implement. Stubbed the same way
  // publish-post-dialog.test.tsx does, so the two suites agree on what
  // "the dialog opened" means.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});
afterEach(cleanup);

/*
 * Same class of bug as an empty custom board publishing as a hole in the feed
 * (see custom-board-empty-publish.test.tsx): nothing stopped Publish from
 * being pressed with nothing ranked at all. The dialog it opens has no way to
 * say "there's nothing here" once it's already open with an empty board, so
 * the refusal has to happen at the button, before that dialog exists.
 */
describe("publishing an empty tier list", () => {
  it("is refused at the button, with a reason, for a board with nothing ranked", () => {
    renderActions([]);

    clickPublish();

    expect(onNotify).toHaveBeenCalledWith("Rank at least one title before publishing");
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  it("opens normally once something is ranked", () => {
    renderActions([title()]);

    clickPublish();

    expect(onNotify).not.toHaveBeenCalledWith("Rank at least one title before publishing");
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });
});
