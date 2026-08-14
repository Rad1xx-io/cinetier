import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import {
  resetLazyCriteriaCache,
  useLazyCriteria,
  type UseLazyCriteriaOptions,
} from "@/lib/hooks/use-lazy-criteria";
import type { CriterionScore } from "@/lib/types/criteria";

const scores: CriterionScore[] = [{ criterionId: "story", name: "Сюжет", score: 9 }];

function Probe(props: UseLazyCriteriaOptions) {
  useLazyCriteria(props);
  return null;
}

function setup(overrides: Partial<UseLazyCriteriaOptions> = {}) {
  const pull = vi.fn().mockResolvedValue(scores);
  const onLoaded = vi.fn();
  const props: UseLazyCriteriaOptions = {
    tmdbId: 1,
    mediaType: "movie",
    userId: "user-1",
    isOpen: true,
    hasLocalScores: false,
    pull,
    onLoaded,
    ...overrides,
  };
  return { pull, onLoaded, view: render(<Probe {...props} />), props };
}

afterEach(() => {
  cleanup();
  resetLazyCriteriaCache();
  vi.restoreAllMocks();
});

describe("useLazyCriteria", () => {
  it("fetches when a ranked card opens without a local breakdown", async () => {
    const { pull, onLoaded } = setup();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(scores));
    expect(pull).toHaveBeenCalledWith("user-1", 1, "movie");
  });

  it("does not fetch for a closed card", () => {
    const { pull } = setup({ isOpen: false });
    expect(pull).not.toHaveBeenCalled();
  });

  it("does not fetch when the breakdown is already local", () => {
    const { pull } = setup({ hasLocalScores: true });
    expect(pull).not.toHaveBeenCalled();
  });

  it("does not fetch for a signed-out visitor", () => {
    const { pull } = setup({ userId: null });
    expect(pull).not.toHaveBeenCalled();
  });

  it("caches the answer so reopening the same card does not refetch", async () => {
    const first = setup();
    await waitFor(() => expect(first.pull).toHaveBeenCalledTimes(1));
    cleanup();

    const second = setup();
    expect(second.pull).not.toHaveBeenCalled();
  });

  it("remembers an empty answer, so a title with no breakdown is asked for once", async () => {
    const pull = vi.fn().mockResolvedValue([]);
    const onLoaded = vi.fn();
    render(
      <Probe
        tmdbId={2}
        mediaType="movie"
        userId="user-1"
        isOpen
        hasLocalScores={false}
        pull={pull}
        onLoaded={onLoaded}
      />
    );

    await waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
    // Nothing is written locally for an empty result, so only the cache stops
    // the next open from asking again.
    expect(onLoaded).not.toHaveBeenCalled();
    cleanup();

    render(
      <Probe
        tmdbId={2}
        mediaType="movie"
        userId="user-1"
        isOpen
        hasLocalScores={false}
        pull={pull}
        onLoaded={onLoaded}
      />
    );
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("lets a failed lookup be retried on the next open", async () => {
    const pull = vi.fn().mockRejectedValue(new Error("offline"));
    const props = {
      tmdbId: 3, mediaType: "movie" as const, userId: "user-1",
      isOpen: true, hasLocalScores: false, pull, onLoaded: vi.fn(),
    };

    render(<Probe {...props} />);
    await waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
    cleanup();

    render(<Probe {...props} />);
    await waitFor(() => expect(pull).toHaveBeenCalledTimes(2));
  });

  it("keeps separate answers per user, so switching accounts refetches", async () => {
    const first = setup();
    await waitFor(() => expect(first.pull).toHaveBeenCalledTimes(1));
    cleanup();

    const second = setup({ userId: "user-2" });
    await waitFor(() => expect(second.pull).toHaveBeenCalledTimes(1));
  });
});
