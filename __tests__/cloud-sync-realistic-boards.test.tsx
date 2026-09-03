import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

/**
 * A sign-in with real boards on both sides.
 *
 * The gap these close: every earlier test of this provider signed in with
 * nothing anywhere — zero local, zero cloud — or with one small fixed board.
 * `decideSync` branches on which side has data *and* on who owns the local
 * board, so most of its outcomes had never been driven end to end through the
 * provider with both sides populated, and neither had the write, the render
 * cascade, or the push those outcomes trigger.
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
const listeners = new Set<AuthListener>();
function emit(event: string, session: Session | null) {
  listeners.forEach((l) => l(event as AuthChangeEvent, session));
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
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useRankedChannels } from "@/lib/hooks/use-ranked-channels";
import { getRatedTitles, reorderAll } from "@/lib/storage";
import { getRatedChannels, reorderAllChannels } from "@/lib/storage/youtube";
import { stampLocalOwner } from "@/lib/storage/local-owner";
import { RANKINGS_CHANGED_EVENT } from "@/lib/storage/local-storage-repository";

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";
const sessionFor = (id: string) => ({ user: { id } }) as Session;

/** Big enough to be a real board, and to make anything linear in it visible. */
const REAL = 200;

function titles(n: number, seed = 0) {
  return Array.from({ length: n }, (_, i) => ({
    tmdbId: seed + i,
    mediaType: "movie" as const,
    title: `Film number ${i} with a reasonably long real-world title`,
    posterPath: `/poster${i}.jpg`,
    releaseDate: "2015-01-01",
    tier: (["S", "A", "B", "C", "D", "F", "Unrated"] as const)[i % 7],
    order: i,
    voteAverage: 7.5,
    addedAt: 1_755_100_000_000,
    updatedAt: 1_755_100_000_000,
  }));
}

function channels(n: number, seed = 0) {
  return Array.from({ length: n }, (_, i) => ({
    channelId: `UC${seed + i}xxxxxxxxxxxx`,
    title: `Channel ${i}`,
    thumbnailUrl: `https://yt3.example/${i}.jpg`,
    country: "US",
    tier: "B" as const,
    order: i,
    subscriberCount: 100_000 + i,
    addedAt: 1_755_100_000_000,
    updatedAt: 1_755_100_000_000,
  }));
}

/** What a /tier-list navigation mounts: both boards, more than one reader. */
function Board() {
  const t = useRankedTitles();
  const c = useRankedChannels();
  return <div data-t={t.titles.length} data-c={c.channels.length} />;
}

const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/** Puts a board in this browser and says who ranked it. */
function seedLocal(count: number, owner: string | null) {
  // Stamped first: ensureLocalOwner only attributes an empty browser, so a
  // board written before the marker reads as unattributable, not as a guest's.
  stampLocalOwner(owner);
  reorderAll(titles(count, 1000));
  reorderAllChannels(channels(count, 1000));
}

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

function cloudHas(count: number) {
  pullCloudTitles.mockResolvedValue({ status: "ok", items: titles(count, 5000) });
  pullCloudChannels.mockResolvedValue({ status: "ok", items: channels(count, 5000) });
}

async function signIn(userId: string) {
  render(
    <>
      <CloudSyncProvider />
      <Board />
      <Board />
    </>
  );
  emit("SIGNED_IN", sessionFor(userId));
  await settle();
}

describe("a real cloud board arriving on a browser that already has one", () => {
  it("replaces the local board with the account's own, and pushes nothing back", async () => {
    seedLocal(REAL, A);
    cloudHas(150);

    await signIn(B);

    expect(getRatedTitles()).toHaveLength(150);
    expect(getRatedChannels()).toHaveLength(150);
    expect(pushCloudTitles).not.toHaveBeenCalled();
    expect(pushCloudChannels).not.toHaveBeenCalled();
  });

  it("does so in one sync, however much data is involved", async () => {
    seedLocal(REAL, A);
    cloudHas(REAL);

    await signIn(B);

    expect(pullCloudTitles).toHaveBeenCalledTimes(1);
    expect(pullCloudChannels).toHaveBeenCalledTimes(1);
  });
});

describe("a real guest board meeting an empty account", () => {
  it("is adopted whole, not a page of it", async () => {
    seedLocal(REAL, null);
    cloudHas(0);

    await signIn(B);

    expect(pushCloudTitles).toHaveBeenCalledTimes(1);
    expect((pushCloudTitles.mock.calls[0][1] as unknown[]).length).toBe(REAL);
    expect((pushCloudChannels.mock.calls[0][1] as unknown[]).length).toBe(REAL);
    // Adopting sends it up; it stays here too.
    expect(getRatedTitles()).toHaveLength(REAL);
  });
});

describe("a real board belonging to somebody else", () => {
  it("is dropped rather than pushed into the arriving account", async () => {
    // The case the ownership marker exists for, now with a board big enough
    // that pushing it would be a visible act of damage.
    seedLocal(REAL, A);
    cloudHas(0);

    await signIn(B);

    expect(pushCloudTitles).not.toHaveBeenCalled();
    expect(pushCloudChannels).not.toHaveBeenCalled();
    expect(getRatedTitles()).toHaveLength(0);
  });
});

describe("a failed read with real data on the line", () => {
  it("leaves a full local board exactly as it was", async () => {
    seedLocal(REAL, B);
    pullCloudTitles.mockResolvedValue({ status: "failed", reason: "network" });
    pullCloudChannels.mockResolvedValue({ status: "ok", items: channels(10, 5000) });

    await signIn(B);
    await settle(2200);

    expect(getRatedTitles()).toHaveLength(REAL);
    // One half failing stops both halves — the board is never left in a state
    // neither side ever held.
    expect(getRatedChannels()).toHaveLength(REAL);
    expect(pushCloudTitles).not.toHaveBeenCalled();
  });
});

describe("the write a real sync performs", () => {
  it("notifies readers once per board, not once per row", async () => {
    seedLocal(0, null);
    cloudHas(REAL);

    // Counted from here, so the seeding's own write is not in the total.
    let dispatches = 0;
    const count = () => dispatches++;
    window.addEventListener(RANKINGS_CHANGED_EVENT, count);

    await signIn(B);

    window.removeEventListener(RANKINGS_CHANGED_EVENT, count);
    // One replace, one event — the cascade each event sets off re-reads and
    // re-serializes the whole board in every mounted consumer.
    expect(dispatches).toBe(1);
    expect(getRatedTitles()).toHaveLength(REAL);
  });

  it("does not leave the board reading as unavailable afterwards", async () => {
    // The write is what PR #68's availability probe sits in front of; a big
    // one must not trip it.
    seedLocal(0, null);
    cloudHas(REAL);

    const { container } = render(
      <>
        <CloudSyncProvider />
        <Board />
      </>
    );
    emit("SIGNED_IN", sessionFor(B));
    await settle();

    expect(container.querySelector("[data-t]")?.getAttribute("data-t")).toBe(String(REAL));
  });
});
