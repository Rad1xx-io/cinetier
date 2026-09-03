import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

/**
 * The sign-in freeze, and the loop underneath it.
 *
 * Reported from Firefox: following a fresh email link left the page unable to
 * respond to a click, and on a second attempt pegged the tab for about two
 * minutes. The trace showed a sync running with nothing to sync — zero local
 * rankings, zero in the cloud — which rules out "a big board is slow" and
 * leaves control flow.
 *
 * Two facts about `@supabase/auth-js`, both read from the installed version
 * rather than assumed, are what these tests pin down:
 *
 *   1. `onAuthStateChange` is not a sign-in notification. `_recoverAndRefresh()`
 *      re-emits `SIGNED_IN` for any valid stored session without comparing it
 *      against what it last reported, and `_onVisibilityChanged` calls it every
 *      time the tab becomes visible.
 *   2. Every PostgREST request asks `auth.getSession()` for its token, and
 *      `getSession()` refreshes when the token is inside its expiry margin —
 *      which emits `TOKEN_REFRESHED` to every subscriber.
 *
 * Together those close a loop: an auth event started a sync, the sync's own
 * reads could emit auth events, and each of those started another sync. The
 * provider now keys on the account rather than the notification, which is what
 * these tests hold it to.
 */

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

/**
 * Several listeners, unlike the single-callback fake the older replay suite
 * uses: the real client has both this provider and the session store attached,
 * and a notification reaches all of them.
 */
const listeners = new Set<AuthListener>();

function emit(event: string, session: Session | null) {
  listeners.forEach((listener) => listener(event as AuthChangeEvent, session));
}

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      onAuthStateChange: (cb: AuthListener) => {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      getSession: async () => ({ data: { session: null } }),
    },
  }),
}));

import { CloudSyncProvider } from "@/components/auth/cloud-sync-provider";
import { getRatedTitles } from "@/lib/storage";
import { retrySync } from "@/lib/storage/sync-status";

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";
const sessionFor = (id: string) => ({ user: { id } }) as Session;

function board(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    tmdbId: 700 + i,
    mediaType: "movie" as const,
    title: `Film ${i}`,
    posterPath: null,
    releaseDate: "2015-01-01",
    tier: "B" as const,
    order: i,
    addedAt: 1_755_100_000_000,
    updatedAt: 1_755_100_000_000,
  }));
}

const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  listeners.clear();
  vi.clearAllMocks();
  pullCloudTitles.mockResolvedValue({ status: "ok", items: [] });
  pullCloudChannels.mockResolvedValue({ status: "ok", items: [] });
  pushCloudTitles.mockResolvedValue(undefined);
  pushCloudChannels.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("a sync whose own reads emit auth events", () => {
  it("does not cascade — the reported freeze", async () => {
    /*
     * Faithful to the SDK: a read calls getSession(), which refreshes a token
     * inside its expiry margin, which notifies every subscriber. Capped at 50
     * deliberately — uncapped, the unfixed provider recurses until the runner
     * gives up, and a test that fails by hanging says less than one that fails
     * by counting. Before the fix this reached the cap; the pull count below
     * is the whole assertion.
     */
    let emitted = 0;
    pullCloudTitles.mockImplementation(async () => {
      if (emitted < 50) {
        emitted++;
        emit("TOKEN_REFRESHED", sessionFor(A));
      }
      return { status: "ok", items: [] };
    });

    render(<CloudSyncProvider />);
    emit("SIGNED_IN", sessionFor(A));
    await settle(300);

    expect(pullCloudTitles.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("stays finished afterwards, rather than settling into a slow loop", async () => {
    render(<CloudSyncProvider />);
    emit("SIGNED_IN", sessionFor(A));
    await settle();
    const afterFirst = pullCloudTitles.mock.calls.length;

    emit("TOKEN_REFRESHED", sessionFor(A));
    emit("TOKEN_REFRESHED", sessionFor(A));
    await settle(200);

    expect(pullCloudTitles.mock.calls.length).toBe(afterFirst);
  });
});

describe("repeated notifications about an account already reconciled here", () => {
  it("ignores SIGNED_IN re-emitted on every return to the tab", async () => {
    render(<CloudSyncProvider />);
    emit("INITIAL_SESSION", sessionFor(A));
    await settle();

    // What _recoverAndRefresh() sends on each visibilitychange → visible.
    emit("SIGNED_IN", sessionFor(A));
    emit("SIGNED_IN", sessionFor(A));
    emit("SIGNED_IN", sessionFor(A));
    await settle();

    expect(pullCloudTitles).toHaveBeenCalledTimes(1);
  });

  it("ignores TOKEN_REFRESHED and USER_UPDATED for that same account", async () => {
    render(<CloudSyncProvider />);
    emit("SIGNED_IN", sessionFor(A));
    await settle();

    emit("TOKEN_REFRESHED", sessionFor(A));
    emit("USER_UPDATED", sessionFor(A));
    await settle();

    expect(pullCloudTitles).toHaveBeenCalledTimes(1);
  });

  it("runs one sync, not two, for the INITIAL_SESSION + SIGNED_IN pair a fresh sign-in produces", async () => {
    render(<CloudSyncProvider />);
    // Back to back, with nothing awaited between them — the sequence the
    // reported console showed, and the one that used to overlap two runs.
    emit("INITIAL_SESSION", sessionFor(A));
    emit("SIGNED_IN", sessionFor(A));
    await settle(1200);

    expect(pullCloudTitles).toHaveBeenCalledTimes(1);
  });
});

describe("the empty push those overlapping runs used to leak", () => {
  it("never pushes an empty board up on a fresh sign-in", async () => {
    // The damage this prevents is not a wasted request: pushCloudTitles
    // deletes every cloud row missing from what it is handed, so a push of an
    // empty board erases the account's saved rankings.
    pullCloudTitles.mockResolvedValue({ status: "ok", items: board(12) });

    render(<CloudSyncProvider />);
    emit("INITIAL_SESSION", sessionFor(A));
    emit("SIGNED_IN", sessionFor(A));
    await settle(1200);

    expect(pushCloudTitles).not.toHaveBeenCalled();
    expect(getRatedTitles()).toHaveLength(12);
  });
});

describe("what must still sync", () => {
  it("a different account, which is the case the ownership marker exists for", async () => {
    render(<CloudSyncProvider />);
    emit("SIGNED_IN", sessionFor(A));
    await settle();
    expect(pullCloudTitles).toHaveBeenCalledTimes(1);

    emit("SIGNED_IN", sessionFor(B));
    await settle();

    expect(pullCloudTitles).toHaveBeenCalledTimes(2);
    expect(pullCloudTitles).toHaveBeenLastCalledWith(B);
  });

  it("the same account signing back in after signing out", async () => {
    render(<CloudSyncProvider />);
    emit("SIGNED_IN", sessionFor(A));
    await settle();

    emit("SIGNED_OUT", null);
    await settle();

    // The board went with the session, so there is nothing left for a repeat
    // of that id to stand for — this has to reconcile again.
    emit("SIGNED_IN", sessionFor(A));
    await settle();

    expect(pullCloudTitles).toHaveBeenCalledTimes(2);
  });

  it("an explicit Try again, even though that account was already reconciled", async () => {
    pullCloudTitles.mockResolvedValue({ status: "failed", reason: "network" });
    render(<CloudSyncProvider />);
    emit("SIGNED_IN", sessionFor(A));
    // A failing read is retried inside the sync (3 attempts, 400ms + 1200ms
    // apart), so this has to outlast that before the count means anything.
    await settle(2200);
    const afterSignIn = pullCloudTitles.mock.calls.length;

    pullCloudTitles.mockResolvedValue({ status: "ok", items: [] });
    retrySync();
    await settle(200);

    expect(pullCloudTitles.mock.calls.length).toBeGreaterThan(afterSignIn);
  });
});

describe("two syncs that do overlap in time", () => {
  it("run one after the other, never interleaved", async () => {
    let inFlight = 0;
    let overlapped = false;
    pullCloudTitles.mockImplementation(async () => {
      inFlight++;
      if (inFlight > 1) overlapped = true;
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return { status: "ok", items: [] };
    });

    render(<CloudSyncProvider />);
    emit("SIGNED_IN", sessionFor(A));
    // Asked for by hand while the sign-in sync is still reading.
    retrySync();
    retrySync();
    await settle(400);

    expect(overlapped).toBe(false);
  });
});
