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
      getSession: async () => ({ data: { session: null } }),
    },
  }),
}));

import { CloudSyncProvider } from "@/components/auth/cloud-sync-provider";
import { getRatedTitles } from "@/lib/storage";
import { readLocalOwner } from "@/lib/storage/local-owner";
import { readSyncTrace } from "@/lib/storage/sync-trace";

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "20148627-7cad-4935-8d03-cdce3387b22b";

function board(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    tmdbId: 500 + i,
    mediaType: "movie" as const,
    title: `A's film ${i}`,
    posterPath: null,
    releaseDate: "2015-01-01",
    tier: "B" as const,
    order: i,
    addedAt: 1_755_100_000_000,
    updatedAt: 1_755_100_000_000,
  }));
}

/** One page load: the provider mounts, then the session it was handed arrives. */
async function pageLoad(session: { id: string } | null) {
  render(<CloudSyncProvider />);
  listener(
    "INITIAL_SESSION" as AuthChangeEvent,
    session ? ({ user: { id: session.id } } as Session) : null
  );
  await new Promise((r) => setTimeout(r, 30));
}

/** An OAuth redirect is a *new page*: the old one is gone, storage survives. */
function redirect() {
  cleanup();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  pullCloudChannels.mockResolvedValue({ status: "ok", items: [] });
  pushCloudTitles.mockResolvedValue(undefined);
  pushCloudChannels.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("the real sequence, replayed page load by page load", () => {
  it("account A signs in, signs out, then account B signs in on the same browser", async () => {
    // 1. Clean browser, nobody signed in.
    pullCloudTitles.mockResolvedValue({ status: "ok", items: [] });
    await pageLoad(null);

    // 2. A signs in — OAuth returns to a fresh page carrying A's session.
    redirect();
    pullCloudTitles.mockResolvedValue({ status: "ok", items: board(59) });
    await pageLoad({ id: A });
    expect(getRatedTitles()).toHaveLength(59);
    expect(readLocalOwner()).toEqual({ kind: "user", userId: A });

    // 3. A signs out, in that same page.
    listener("SIGNED_OUT" as AuthChangeEvent, null);
    await new Promise((r) => setTimeout(r, 10));

    // 4. B signs in — again a fresh page, and B's cloud is empty.
    redirect();
    pullCloudTitles.mockResolvedValue({ status: "ok", items: [] });
    pushCloudTitles.mockClear();
    await pageLoad({ id: B });

    expect(pushCloudTitles).not.toHaveBeenCalled();
    expect(getRatedTitles()).toHaveLength(0);
  });

  it("account B signs in without A signing out first", async () => {
    // The reported path: the Google account is switched straight from the
    // OAuth screen, with the previous session still live.
    pullCloudTitles.mockResolvedValue({ status: "ok", items: [] });
    await pageLoad(null);

    redirect();
    pullCloudTitles.mockResolvedValue({ status: "ok", items: board(59) });
    await pageLoad({ id: A });
    expect(getRatedTitles()).toHaveLength(59);

    // Straight into B's session on the next page load — no sign-out anywhere.
    redirect();
    pullCloudTitles.mockResolvedValue({ status: "ok", items: [] });
    pushCloudTitles.mockClear();
    await pageLoad({ id: B });

    expect(pushCloudTitles).not.toHaveBeenCalled();
    expect(getRatedTitles()).toHaveLength(0);
  });
});

describe("ownership is claimed before the board is written", () => {
  it("stamps the owner ahead of the rankings, so no interruption can leave them unlabelled", async () => {
    const writes: string[] = [];
    const setItem = Storage.prototype.setItem;
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key: string, value: string) {
        writes.push(key);
        return setItem.call(this, key, value);
      });

    pullCloudTitles.mockResolvedValue({ status: "ok", items: board(59) });
    await pageLoad({ id: A });
    spy.mockRestore();

    const owner = writes.indexOf("cinetier:rankings:owner");
    const rankings = writes.indexOf("cinetier:rankings:v1");
    expect(owner).toBeGreaterThanOrEqual(0);
    expect(rankings).toBeGreaterThanOrEqual(0);
    // A page that dies between these two writes must not come back looking
    // like an unowned board — that is the state adoption acts on.
    expect(owner).toBeLessThan(rankings);
  });
});

describe("the trace is readable after the fact", () => {
  it("holds the whole sign-in, across the reloads that clear the console", async () => {
    pullCloudTitles.mockResolvedValue({ status: "ok", items: [] });
    await pageLoad(null);

    redirect();
    pullCloudTitles.mockResolvedValue({ status: "ok", items: board(59) });
    await pageLoad({ id: A });

    listener("SIGNED_OUT" as AuthChangeEvent, null);
    await new Promise((r) => setTimeout(r, 10));

    redirect();
    pullCloudTitles.mockResolvedValue({ status: "ok", items: [] });
    await pageLoad({ id: B });

    // Nobody armed Preserve Log; nobody kept a tab open. The sequence is still
    // there to be read, with the marker each decision was made on.
    const trace = readSyncTrace();
    expect(trace.map((e) => [e.authEvent, e.ownerBefore, e.titlesAction])).toEqual([
      // A first load with nobody signed in: an empty board, kept as it is.
      ["INITIAL_SESSION", "guest", "kept"],
      ["INITIAL_SESSION", "guest", "replace"],
      // The board belonged to the session being ended, and went with it.
      ["SIGNED_OUT", "same-user", "cleared"],
      ["INITIAL_SESSION", "guest", "replace"],
    ]);
  });
});
