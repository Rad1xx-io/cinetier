import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaType } from "@/lib/types";

/**
 * The sync paths at the size a real account actually is.
 *
 * Every test written for this subsystem so far used empty stores, or a fixed
 * board of a few dozen. That left one dimension untested: what these functions
 * do when both sides genuinely have data. Removing rows the cloud no longer
 * needs turned out to be linear in the number of rows — one awaited HTTP round
 * trip each — which is invisible at zero and is the whole cost at two hundred.
 */

interface DeleteCall {
  table: string;
  filters: Array<[string, unknown]>;
  /** The `in (…)` list, which is what makes one request stand for many rows. */
  ids: unknown[];
}

let deletes: DeleteCall[] = [];
let upserts: number[] = [];
let selects = 0;
let selected: Array<{ table: string; columns: string; filter: [string, unknown] }> = [];

function fakeClient(existingRows: Record<string, unknown>[]) {
  return {
    from(table: string) {
      return {
        upsert: async (rows: unknown[]) => {
          upserts.push(rows.length);
          return { error: null };
        },
        select: (columns: string) => ({
          eq: async (column: string, value: unknown) => {
            selects++;
            selected.push({ table, columns, filter: [column, value] });
            return { data: existingRows, error: null };
          },
        }),
        delete: () => {
          const call: DeleteCall = { table, filters: [], ids: [] };
          const chain = {
            eq(column: string, value: unknown) {
              call.filters.push([column, value]);
              return chain;
            },
            in(column: string, ids: unknown[]) {
              call.filters.push([column, `in(${ids.length})`]);
              call.ids = ids;
              deletes.push(call);
              return chain;
            },
            // Awaited at the end of the chain, whichever link that is.
            then(resolve: (value: unknown) => void) {
              resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  };
}

let client: unknown = null;
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => client }));

import { pushCloudTitles } from "@/lib/storage/cloud-sync";
import { pushCloudChannels } from "@/lib/storage/youtube/cloud-sync";

function titles(n: number, seed = 0, mediaType: MediaType = "movie") {
  return Array.from({ length: n }, (_, i) => ({
    tmdbId: seed + i,
    mediaType,
    title: `Film ${i}`,
    posterPath: null,
    releaseDate: "2015-01-01",
    tier: "B" as const,
    order: i,
    addedAt: 1_755_100_000_000,
    updatedAt: 1_755_100_000_000,
  }));
}

function channels(n: number, seed = 0) {
  return Array.from({ length: n }, (_, i) => ({
    channelId: `UC${seed + i}`,
    title: `Channel ${i}`,
    thumbnailUrl: null,
    country: null,
    tier: "B" as const,
    order: i,
    subscriberCount: 100_000 + i,
    addedAt: 1_755_100_000_000,
    updatedAt: 1_755_100_000_000,
  }));
}

const titleRows = (list: ReturnType<typeof titles>) =>
  list.map((t) => ({ tmdb_id: t.tmdbId, media_type: t.mediaType }));
const channelRows = (list: ReturnType<typeof channels>) =>
  list.map((c) => ({ channel_id: c.channelId }));

beforeEach(() => {
  deletes = [];
  upserts = [];
  selects = 0;
  selected = [];
});

describe("replacing a real board's worth of cloud rows", () => {
  it("does not spend one request per row", async () => {
    // Two hundred rows the cloud has and this board does not: the shape a
    // board replaced by another account's produces. Row-at-a-time, this was
    // 200 sequential round trips.
    client = fakeClient(titleRows(titles(200, 9000)));
    await pushCloudTitles("u1", titles(200));

    expect(deletes.length).toBeLessThanOrEqual(4);
    expect(deletes.flatMap((d) => d.ids)).toHaveLength(200);
  });

  it("still removes exactly the stale rows, and no others", async () => {
    // 120 rows in the cloud, the first 100 of which are still ranked locally.
    client = fakeClient(titleRows(titles(120)));
    await pushCloudTitles("u1", titles(100));

    const deletedIds = deletes.flatMap((d) => d.ids).sort((a, b) => Number(a) - Number(b));
    expect(deletedIds).toEqual(titles(20, 100).map((t) => t.tmdbId));
  });

  it("keeps the composite key intact — a tmdb id is only ever deleted for its own media type", async () => {
    // The same numeric id under two media types: grouping must not let a
    // film's id delete the series that happens to share it.
    client = fakeClient([
      { tmdb_id: 1, media_type: "movie" },
      { tmdb_id: 1, media_type: "tv" },
    ]);
    await pushCloudTitles("u1", titles(1, 1, "tv"));

    expect(deletes).toHaveLength(1);
    expect(deletes[0].ids).toEqual([1]);
    expect(deletes[0].filters).toContainEqual(["media_type", "movie"]);
  });

  it("scopes every delete to the signed-in account", async () => {
    client = fakeClient(titleRows(titles(200, 9000)));
    await pushCloudTitles("u1", titles(10));

    for (const call of deletes) expect(call.filters).toContainEqual(["user_id", "u1"]);
  });

  it("chunks a board far past any single URL's limit", async () => {
    client = fakeClient(titleRows(titles(1000, 9000)));
    await pushCloudTitles("u1", []);

    // Bounded by the chunk size, not by the row count.
    expect(deletes.length).toBe(10);
    for (const call of deletes) expect(call.ids.length).toBeLessThanOrEqual(100);
    expect(deletes.flatMap((d) => d.ids)).toHaveLength(1000);
  });

  it("nothing stale means no delete request at all", async () => {
    client = fakeClient(titleRows(titles(200)));
    await pushCloudTitles("u1", titles(200));
    expect(deletes).toHaveLength(0);
  });

  it("reads the cloud's own row list once, not per row", async () => {
    client = fakeClient(titleRows(titles(200, 9000)));
    await pushCloudTitles("u1", titles(200));

    expect(selects).toBe(1);
    expect(selected[0].filter).toEqual(["user_id", "u1"]);
  });
});

describe("the channels board, which had the same row-at-a-time removal", () => {
  it("batches its deletes too", async () => {
    client = fakeClient(channelRows(channels(200, 9000)));
    await pushCloudChannels("u1", channels(200));

    expect(deletes.length).toBeLessThanOrEqual(2);
    expect(deletes.flatMap((d) => d.ids)).toHaveLength(200);
  });

  it("removes exactly the stale channels, scoped to the account", async () => {
    client = fakeClient(channelRows(channels(120)));
    await pushCloudChannels("u1", channels(100));

    expect(deletes.flatMap((d) => d.ids).sort()).toEqual(
      channels(20, 100)
        .map((c) => c.channelId)
        .sort()
    );
    for (const call of deletes) expect(call.filters).toContainEqual(["user_id", "u1"]);
  });

  it("chunks past the URL limit as well", async () => {
    client = fakeClient(channelRows(channels(350, 9000)));
    await pushCloudChannels("u1", []);

    expect(deletes.length).toBe(4);
    expect(deletes.flatMap((d) => d.ids)).toHaveLength(350);
  });
});

describe("a full board still reaches the cloud in one upsert", () => {
  it("titles", async () => {
    client = fakeClient([]);
    await pushCloudTitles("u1", titles(200));
    expect(upserts).toEqual([200]);
  });

  it("channels", async () => {
    client = fakeClient([]);
    await pushCloudChannels("u1", channels(200));
    expect(upserts).toEqual([200]);
  });
});
