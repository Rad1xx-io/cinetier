import { afterEach, describe, expect, it, vi } from "vitest";

const client = { from: vi.fn() };

vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => client }));
vi.mock("@/lib/supabase/session-store", () => ({
  getSessionSnapshot: () => ({ status: "signed-in", user: { id: "author-1" } }),
}));

const { getAuthorChannels, getAuthorTitles, getPostSnapshots, publishPost } = await import(
  "@/lib/supabase/feed"
);

afterEach(() => vi.clearAllMocks());

describe("getAuthorTitles reads a deterministic slice", () => {
  it("orders by id before capping, so the same rows come back every time", async () => {
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const inFn = vi.fn(() => ({ order, limit }));
    client.from.mockReturnValue({ select: () => ({ in: inFn }) });

    await getAuthorTitles(["u1"]);

    // The bug this guards: without an explicit order, "the same 40 rows" was
    // whatever Postgres felt like handing back that call — harmless for a live
    // preview, but a snapshot reads a row's absence as "the author took this
    // down". Ordering makes the cap consistent instead of arbitrary.
    expect(order).toHaveBeenCalledWith("id", { ascending: true });
    // And it has to run before the cap, or the cap could still land on an
    // arbitrary slice of an already-unordered set.
    expect(order.mock.invocationCallOrder[0]).toBeLessThan(limit.mock.invocationCallOrder[0]);
  });
});

describe("getAuthorChannels reads a deterministic slice", () => {
  it("orders by id before capping, same as getAuthorTitles and for the same reason", async () => {
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const inFn = vi.fn(() => ({ order, limit }));
    client.from.mockReturnValue({ select: () => ({ in: inFn }) });

    await getAuthorChannels(["u1"]);

    expect(order).toHaveBeenCalledWith("id", { ascending: true });
    expect(order.mock.invocationCallOrder[0]).toBeLessThan(limit.mock.invocationCallOrder[0]);
  });
});

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.eq = self;
  builder.in = self;
  builder.order = self;
  builder.limit = self;
  builder.single = () => Promise.resolve(result);
  builder.insert = () => builder;
  builder.delete = () => builder;
  // `await`-able directly, for a call site that never reaches `.single()`.
  builder.then = (resolve: (value: typeof result) => void) => resolve(result);
  return builder;
}

describe("publishing a post freezes the board that was on screen", () => {
  it("writes a snapshot built from the titles handed to it", async () => {
    const inserted: Record<string, unknown>[] = [];
    client.from.mockImplementation((table: string) => {
      if (table === "posts") return chain({ data: { id: "post-1" }, error: null });
      if (table === "ranked_title_publications") {
        return {
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const titles = [
      { tmdbId: 1, mediaType: "movie" as const, title: "A", posterPath: null, releaseDate: null, tier: "S" as const, order: 0, addedAt: 0, updatedAt: 0 },
      { tmdbId: 2, mediaType: "anime" as const, title: "B", posterPath: null, releaseDate: null, tier: "A" as const, order: 1, addedAt: 0, updatedAt: 0 },
    ];

    const result = await publishPost({ title: "My list", description: "", category: "mixed", titles, rulesConfirmed: true });

    expect(result).toEqual({ ok: true, postId: "post-1" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      post_id: "post-1",
      snapshot: {
        titles: [
          { tmdbId: 1, mediaType: "movie", tier: "S", order: 0, title: "A" },
          { tmdbId: 2, mediaType: "anime", tier: "A", order: 1, title: "B" },
        ],
        // No channels handed in — an empty array, not a missing key, so a
        // reader never has to guess whether this post predates channels.
        channels: [],
      },
    });
    /*
     * The catalogue facts ARE frozen now, which reverses what this test used
     * to assert. A post is a post: un-ranking a title afterwards edits the
     * board, not what somebody already read. Nothing moderates an individual
     * catalogue title, so freezing them takes no takedown lever away — the
     * author's whole-profile is_public flag still gates the post entirely.
     */
    const frozen = JSON.stringify(inserted[0].snapshot);
    expect(frozen).toContain('"title":"A"');
    expect(frozen).toContain("posterPath");
    expect(frozen).toContain("releaseDate");
  });

  it("freezes channels the same way, and just as thinly", async () => {
    const inserted: Record<string, unknown>[] = [];
    client.from.mockImplementation((table: string) => {
      if (table === "posts") return chain({ data: { id: "post-1" }, error: null });
      if (table === "ranked_title_publications") {
        return {
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const channels = [
      { channelId: "c1", title: "Some Channel", thumbnailUrl: null, country: null, tier: "S" as const, order: 0, addedAt: 0, updatedAt: 0 },
    ];

    const result = await publishPost({
      title: "My channels",
      description: "",
      category: "youtube",
      titles: [],
      channels,
      rulesConfirmed: true,
    });

    expect(result).toEqual({ ok: true, postId: "post-1" });
    expect(inserted[0]).toMatchObject({
      snapshot: {
        titles: [],
        channels: [{ channelId: "c1", tier: "S", order: 0, title: "Some Channel" }],
      },
    });
    // Same reversal as titles, for the same reason.
    const frozenChannels = JSON.stringify(inserted[0].snapshot);
    expect(frozenChannels).toContain('"title":"Some Channel"');
    expect(frozenChannels).toContain("thumbnailUrl");
  });

  it("withdraws the post rather than leaving one with no snapshot", async () => {
    let deletedId: string | null = null;
    client.from.mockImplementation((table: string) => {
      if (table === "posts") {
        return {
          ...chain({ data: { id: "post-1" }, error: null }),
          delete: () => ({
            eq: (_col: string, value: string) => {
              deletedId = value;
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "ranked_title_publications") {
        return { insert: () => Promise.resolve({ error: { message: "constraint violated" } }) };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const titles = [
      { tmdbId: 1, mediaType: "movie" as const, title: "A", posterPath: null, releaseDate: null, tier: "S" as const, order: 0, addedAt: 0, updatedAt: 0 },
    ];
    const result = await publishPost({ title: "My list", description: "", category: "mixed", titles, rulesConfirmed: true });

    expect(result).toEqual({ ok: false, error: "Could not publish the post. Please try again." });
    // The half-made post — no snapshot behind it — must not survive to be
    // rendered live forever, the exact bug this feature closes.
    expect(deletedId).toBe("post-1");
  });
});

describe("getPostSnapshots", () => {
  it("keys the frozen titles by post id", async () => {
    client.from.mockReturnValue(
      chain({
        data: [
          { post_id: "p1", snapshot: { titles: [{ tmdbId: 1, mediaType: "movie", tier: "S", order: 0 }] } },
        ],
        error: null,
      })
    );

    const snapshots = await getPostSnapshots(["p1", "p2"]);

    expect(snapshots.get("p1")).toEqual({
      titles: [{ tmdbId: 1, mediaType: "movie", tier: "S", order: 0 }],
      channels: [],
    });
    // A post with no row here — not yet published under this scheme — gets no
    // entry at all, which is what tells resolveSnapshotTitles to fall back to
    // a live read instead of showing an empty board.
    expect(snapshots.has("p2")).toBe(false);
  });

  it("defaults channels to empty for a snapshot written before channels existed", async () => {
    // The real shape of every row written before this feature — no `channels`
    // key at all, not an empty array. Must not crash, and must not be
    // mistaken for "this post predates snapshots entirely" (that is `undefined`
    // at the Map level, not an empty array inside a present entry).
    client.from.mockReturnValue(
      chain({
        data: [{ post_id: "p1", snapshot: { titles: [] } }],
        error: null,
      })
    );

    const snapshots = await getPostSnapshots(["p1"]);

    expect(snapshots.get("p1")).toEqual({ titles: [], channels: [] });
  });

  it("asks for nothing when there is nothing to ask about", async () => {
    const snapshots = await getPostSnapshots([]);
    expect(snapshots.size).toBe(0);
    expect(client.from).not.toHaveBeenCalled();
  });
});
