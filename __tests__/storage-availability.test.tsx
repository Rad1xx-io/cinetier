import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useRankedChannels } from "@/lib/hooks/use-ranked-channels";
import { getSnapshot as titlesSnapshot } from "@/lib/storage/ranked-titles-store";
import { getSnapshot as channelsSnapshot } from "@/lib/storage/youtube/ranked-channels-store";
import { addTitle } from "@/lib/storage";

/**
 * "Local storage is unavailable in this browser" on a client-side navigation,
 * in a browser where a full page load of the same page works fine.
 *
 * The asymmetry is the tell. A full load builds these store modules from
 * scratch; a client-side navigation reuses them. So the bug had to be state
 * held in the module — and it was: the unavailable branch of `computeSnapshot`
 * replaced the cached snapshot but left `cachedKey` alone, so the next healthy
 * read serialized the same unchanged board, matched that stale key, and
 * returned the cached "unavailable" object. One momentary failure poisoned
 * every later read for the life of the tab.
 *
 * The probe is also a real `setItem`/`removeItem` round trip, and it ran on
 * every snapshot read — measured at 18 for a single navigation, since several
 * hooks mount at once and `useSyncExternalStore` reads more than once each.
 * Those are the two things these tests hold down, from both directions:
 * storage that is fine must never read as unavailable, and storage that is
 * genuinely gone must still be noticed.
 */

/** Explicit clock, so the availability window is exercised rather than waited out. */
let now = 1_760_000_000_000;

function Board({ id }: { id: string }) {
  const { storageAvailable, hydrated } = useRankedTitles();
  return (
    <div data-testid={id}>{!hydrated ? "loading" : storageAvailable ? "ok" : "unavailable"}</div>
  );
}

function ChannelBoard({ id }: { id: string }) {
  const { storageAvailable } = useRankedChannels();
  return <div data-testid={id}>{storageAvailable ? "ok" : "unavailable"}</div>;
}

/** Past the availability window, so the next read probes for real. */
function moveClockPastTheWindow() {
  now += 5_000;
}

function failEveryProbe() {
  const real = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key: string,
    value: string
  ) {
    if (key === "__tierlistonline_test__") throw new DOMException("QuotaExceededError");
    return real.call(this, key, value);
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  moveClockPastTheWindow();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("what a client-side navigation to /tier-list mounts", () => {
  it("reads as available throughout, with storage that is fine", () => {
    render(
      <>
        <Board id="a" />
        <Board id="b" />
        <ChannelBoard id="c" />
      </>
    );

    expect(screen.getByTestId("a").textContent).toBe("ok");
    expect(screen.getByTestId("b").textContent).toBe("ok");
    expect(screen.getByTestId("c").textContent).toBe("ok");
  });

  it("does not re-probe storage for every read in the burst", () => {
    // Warm the answer the way arriving on the dashboard first would.
    titlesSnapshot();

    const real = Storage.prototype.setItem;
    let probes = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === "__tierlistonline_test__") probes++;
      return real.call(this, key, value);
    });

    render(
      <>
        <Board id="a" />
        <Board id="b" />
        <ChannelBoard id="c" />
      </>
    );

    // Was 18 before this fix — one real write and delete per snapshot read.
    expect(probes).toBeLessThanOrEqual(1);
  });
});

describe("a momentary failure, with storage healthy again straight afterwards", () => {
  it("does not leave the board permanently unusable — the reported bug", () => {
    // The dashboard, loaded and working.
    expect(titlesSnapshot().status).toBe("ready");

    // One failed check, registered for real rather than absorbed by a
    // still-fresh answer.
    moveClockPastTheWindow();
    const spy = failEveryProbe();
    expect(titlesSnapshot().status).toBe("unavailable");
    spy.mockRestore();

    // Storage is fine again and the board never changed — which is exactly
    // the case the stale key used to swallow.
    moveClockPastTheWindow();
    expect(titlesSnapshot().status).toBe("ready");

    render(<Board id="after" />);
    expect(screen.getByTestId("after").textContent).toBe("ok");
  });

  it("recovers on the channels board too", () => {
    expect(channelsSnapshot().status).toBe("ready");

    moveClockPastTheWindow();
    const spy = failEveryProbe();
    expect(channelsSnapshot().status).toBe("unavailable");
    spy.mockRestore();

    moveClockPastTheWindow();
    expect(channelsSnapshot().status).toBe("ready");
  });
});

describe("storage that is genuinely gone is still detected", () => {
  it("is reported once the cached answer expires, not hidden by it", () => {
    expect(titlesSnapshot().status).toBe("ready");

    const spy = failEveryProbe();
    moveClockPastTheWindow();

    expect(titlesSnapshot().status).toBe("unavailable");
    render(<Board id="gone" />);
    expect(screen.getByTestId("gone").textContent).toBe("unavailable");
    spy.mockRestore();
  });

  it("is reported immediately when a real write fails, without waiting for that window", () => {
    expect(titlesSnapshot().status).toBe("ready");

    // Not the probe — the write that actually mattered. The cached answer
    // says "available" and has not expired, so only the failed write itself
    // can tell the truth here.
    const real = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === "cinetier:rankings:v1") throw new DOMException("QuotaExceededError");
      return real.call(this, key, value);
    });

    expect(() =>
      addTitle({
        tmdbId: 991,
        mediaType: "movie",
        title: "Something",
        posterPath: null,
        releaseDate: "2020-01-01",
      })
    ).not.toThrow();

    expect(titlesSnapshot().status).toBe("unavailable");
    spy.mockRestore();
  });
});

describe("the unavailable snapshot React is handed", () => {
  it("keeps one identity across reads, so useSyncExternalStore does not spin", () => {
    const spy = failEveryProbe();
    moveClockPastTheWindow();

    const first = titlesSnapshot();
    const second = titlesSnapshot();
    expect(first.status).toBe("unavailable");
    expect(second).toBe(first);
    spy.mockRestore();
  });
});
