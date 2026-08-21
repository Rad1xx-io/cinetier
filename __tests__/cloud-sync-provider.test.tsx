import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const pullCloudTitles = vi.fn();
const pushCloudTitles = vi.fn();
const pullCloudChannels = vi.fn();
const pushCloudChannels = vi.fn();

vi.mock("@/lib/storage/cloud-sync", () => ({
  pullCloudTitles: (...a: unknown[]) => pullCloudTitles(...a),
  pushCloudTitles: (...a: unknown[]) => pushCloudTitles(...a),
}));
vi.mock("@/lib/storage/youtube/cloud-sync", () => ({
  pullCloudChannels: (...a: unknown[]) => pullCloudChannels(...a),
  pushCloudChannels: (...a: unknown[]) => pushCloudChannels(...a),
}));

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;
let listener: AuthListener = () => {};

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      onAuthStateChange: (cb: AuthListener) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  }),
}));

import { CloudSyncProvider } from "@/components/auth/cloud-sync-provider";
import { getRatedTitles, reorderAll } from "@/lib/storage";
import { stampLocalOwner, readLocalOwner } from "@/lib/storage/local-owner";
import { getSyncStatus, retrySync, setSyncStatus } from "@/lib/storage/sync-status";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";

function board(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    tmdbId: 100 + i,
    mediaType: "movie" as const,
    title: `Film ${i}`,
    posterPath: null,
    releaseDate: "2020-01-01",
    tier: "A" as const,
    order: i,
    addedAt: 1_755_000_000_000,
    updatedAt: 1_755_000_000_000,
  }));
}

function signIn(userId: string) {
  return listener("SIGNED_IN" as AuthChangeEvent, { user: { id: userId } } as Session);
}
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  setSyncStatus({ state: "idle" });
  vi.clearAllMocks();
  pullCloudTitles.mockResolvedValue({ status: "ok", items: [] });
  pullCloudChannels.mockResolvedValue({ status: "ok", items: [] });
  pushCloudTitles.mockResolvedValue(undefined);
  pushCloudChannels.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("account switch on a shared browser", () => {
  it("does not give account B the board that account A left behind", async () => {
    reorderAll(board(59));
    stampLocalOwner(A);

    render(<CloudSyncProvider />);
    signIn(B);
    await settle();

    expect(pushCloudTitles).not.toHaveBeenCalled();
    expect(getRatedTitles()).toHaveLength(0);
    expect(readLocalOwner()).toEqual({ kind: "user", userId: B });
  });

  it("hands B their own board when they have one", async () => {
    reorderAll(board(59));
    stampLocalOwner(A);
    pullCloudTitles.mockResolvedValue({ status: "ok", items: board(3) });

    render(<CloudSyncProvider />);
    signIn(B);
    await settle();

    expect(pushCloudTitles).not.toHaveBeenCalled();
    expect(getRatedTitles()).toHaveLength(3);
  });
});

describe("a failed cloud read", () => {
  it("does not adopt the local board when the read returned an error", async () => {
    // Fake timers on purpose: the read is retried with backoff, so asserting
    // before that finishes would pass while the sync was still running.
    vi.useFakeTimers();
    reorderAll(board(5));
    stampLocalOwner(null); // a genuine guest — the one case that may adopt
    pullCloudTitles.mockResolvedValue({ status: "failed", reason: "401" });

    render(<CloudSyncProvider />);
    signIn(B);
    await vi.advanceTimersByTimeAsync(3000);

    expect(pushCloudTitles).not.toHaveBeenCalled();
    // and it must not clear either — nothing is known, so nothing moves.
    expect(getRatedTitles()).toHaveLength(5);
    vi.useRealTimers();
  });

  it("stops both halves when only the channel read failed", async () => {
    vi.useFakeTimers();
    reorderAll(board(5));
    stampLocalOwner(null);
    pullCloudChannels.mockResolvedValue({ status: "failed", reason: "network" });

    render(<CloudSyncProvider />);
    signIn(B);
    await vi.advanceTimersByTimeAsync(3000);

    expect(pushCloudTitles).not.toHaveBeenCalled();
    expect(getRatedTitles()).toHaveLength(5);
    vi.useRealTimers();
  });
});

describe("the legitimate guest funnel", () => {
  it("adopts a board ranked before signing up", async () => {
    reorderAll(board(4));
    stampLocalOwner(null);

    render(<CloudSyncProvider />);
    signIn(B);
    await settle();

    expect(pushCloudTitles).toHaveBeenCalledTimes(1);
    expect(pushCloudTitles.mock.calls[0][0]).toBe(B);
    expect(pushCloudTitles.mock.calls[0][1]).toHaveLength(4);
    expect(readLocalOwner()).toEqual({ kind: "user", userId: B });
  });
});

describe("sessions that end without a sign-out", () => {
  it("clears a board left by an account that never signed out", async () => {
    // A closed tab, a crash or an expired token: the app simply starts with
    // no session while the previous account's board is still here.
    reorderAll(board(59));
    stampLocalOwner(A);

    render(<CloudSyncProvider />);
    listener("INITIAL_SESSION" as AuthChangeEvent, null);
    await settle();

    expect(getRatedTitles()).toHaveLength(0);
    expect(readLocalOwner()).toBeNull();
  });

  it("leaves a guest's own board alone when there is no session", async () => {
    reorderAll(board(4));
    stampLocalOwner(null);

    render(<CloudSyncProvider />);
    listener("INITIAL_SESSION" as AuthChangeEvent, null);
    await settle();

    expect(getRatedTitles()).toHaveLength(4);
  });

  it("never pushes the cleared board up — that would delete the cloud copy", async () => {
    reorderAll(board(59));
    stampLocalOwner(A);

    render(<CloudSyncProvider />);
    listener("SIGNED_OUT" as AuthChangeEvent, null);
    await settle();
    await new Promise((r) => setTimeout(r, 700)); // past the push debounce

    expect(pushCloudTitles).not.toHaveBeenCalled();
    expect(pushCloudChannels).not.toHaveBeenCalled();
  });
});

describe("a second tab handing the browser to someone else", () => {
  it("drops a push that was scheduled for the account that has since left", async () => {
    vi.useFakeTimers();
    reorderAll(board(2));
    stampLocalOwner(A);

    render(<CloudSyncProvider />);
    signIn(A);
    await vi.advanceTimersByTimeAsync(10);
    // A's own sign-in legitimately pushed their unsynced board; this test is
    // about what happens to an edit scheduled afterwards.
    pushCloudTitles.mockClear();

    // An edit schedules a push for A…
    reorderAll(board(3));
    window.dispatchEvent(new Event("cinetier:rankings-changed"));
    // …and before the debounce fires, another tab signs in as B.
    stampLocalOwner(B);
    listener("SIGNED_OUT" as AuthChangeEvent, null);
    await vi.advanceTimersByTimeAsync(1000);

    expect(pushCloudTitles).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("what the visitor is told when the cloud cannot be read", () => {
  it("retries before believing a failure, and says nothing when a retry works", async () => {
    vi.useFakeTimers();
    pullCloudTitles
      .mockResolvedValueOnce({ status: "failed", reason: "401" })
      .mockResolvedValue({ status: "ok", items: board(3) });

    render(<CloudSyncProvider />);
    signIn(B);
    await vi.advanceTimersByTimeAsync(2000);

    expect(pullCloudTitles.mock.calls.length).toBeGreaterThan(1);
    expect(getSyncStatus().state).toBe("idle");
    expect(getRatedTitles()).toHaveLength(3);
    vi.useRealTimers();
  });

  it("raises a visible failure once the retries are spent", async () => {
    vi.useFakeTimers();
    pullCloudTitles.mockResolvedValue({ status: "failed", reason: "401" });

    render(<CloudSyncProvider />);
    signIn(B);
    await vi.advanceTimersByTimeAsync(3000);

    const status = getSyncStatus();
    expect(status.state).toBe("failed");
    expect(status.state === "failed" && status.reason).toContain("401");
    vi.useRealTimers();
  });

  it("recovers when the visitor presses Try again", async () => {
    vi.useFakeTimers();
    pullCloudTitles.mockResolvedValue({ status: "failed", reason: "401" });

    render(<CloudSyncProvider />);
    signIn(B);
    await vi.advanceTimersByTimeAsync(3000);
    expect(getSyncStatus().state).toBe("failed");

    pullCloudTitles.mockResolvedValue({ status: "ok", items: board(2) });
    retrySync();
    await vi.advanceTimersByTimeAsync(2000);

    expect(getSyncStatus().state).toBe("idle");
    expect(getRatedTitles()).toHaveLength(2);
    vi.useRealTimers();
  });

  it("clears the warning when the session ends", async () => {
    vi.useFakeTimers();
    pullCloudTitles.mockResolvedValue({ status: "failed", reason: "401" });

    render(<CloudSyncProvider />);
    signIn(B);
    await vi.advanceTimersByTimeAsync(3000);
    expect(getSyncStatus().state).toBe("failed");

    listener("SIGNED_OUT" as AuthChangeEvent, null);
    await vi.advanceTimersByTimeAsync(0);

    expect(getSyncStatus().state).toBe("idle");
    vi.useRealTimers();
  });
});
