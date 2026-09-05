import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addTierRow,
  clearTierRowImage,
  deleteCustomBoard,
  deleteItem,
  deleteTierRow,
  clearCustomBoard,
} from "@/lib/supabase/custom-lists";

interface Row {
  id: string;
  list_id?: string;
  image_path: string | null;
  position?: number;
  /** Set by remove_custom_item when a published post still shows this card. */
  detached_at?: string | null;
}

interface World {
  custom_items: Row[];
  custom_tier_rows: Row[];
  /** list_ids that have a live post — what the fake delete_custom_board reads. */
  published?: string[];
  /** item ids a publication's snapshot names, which is what makes them survive removal. */
  publishedItems?: string[];
  /** Set to make the write fail, as a dropped connection would. */
  writeFails?: boolean;
  /** Set to make the bucket refuse, as an outage would. */
  storageThrows?: boolean;
}

/** A promise that also carries the builder methods, the way postgrest-js does. */
function thenable<T>(value: T, extra: Record<string, unknown> = {}) {
  return Object.assign(Promise.resolve(value), extra) as never;
}

function fakeClient(world: World) {
  const removed: string[][] = [];
  const inserted: Record<string, unknown>[] = [];
  const order: string[] = [];

  const table = (name: keyof World) => (world[name] ?? []) as Row[];

  const client = {
    from(name: string) {
      const rows = () => table(name as keyof World);
      return {
        select() {
          return thenable(
            { data: rows(), error: null },
            {
              eq: (_column: string, value: string) =>
                thenable(
                  {
                    data: rows().filter((r) => r.list_id === value || r.id === value),
                    error: null,
                  },
                  {
                    maybeSingle: async () => {
                      // A copy, as a real client returns. Handing back the live
                      // object let a later update blank the very field the
                      // caller had read a moment earlier.
                      const found = rows().find((r) => r.id === value);
                      return { data: found ? { ...found } : null, error: null };
                    },
                    order: () => ({
                      limit: () => ({
                        maybeSingle: async () => ({
                          data:
                            [...rows()]
                              .filter((r) => r.list_id === value)
                              .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))[0] ?? null,
                          error: null,
                        }),
                      }),
                    }),
                  }
                ),
              in: (_column: string, values: string[]) =>
                thenable({
                  data: rows().filter((r) => r.image_path && values.includes(r.image_path)),
                  error: null,
                }),
            }
          );
        },
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          return thenable({ error: null });
        },
        update() {
          return {
            eq: async (_column: string, value: string) => {
              order.push(`update ${name}`);
              if (world.writeFails) return { error: { message: "no connection" } };
              const row = rows().find((r) => r.id === value);
              if (row) row.image_path = null;
              return { error: null };
            },
          };
        },
        delete() {
          return {
            eq: async (_column: string, value: string) => {
              order.push(`delete ${name}`);
              if (world.writeFails) return { error: { message: "no connection" } };

              if (name === "custom_tier_lists") {
                // What the foreign keys do: the board takes its tiers and its
                // cards with it. Without this the fake would report every file
                // as still referenced and never delete anything.
                world.custom_tier_rows = world.custom_tier_rows.filter((r) => r.list_id !== value);
                world.custom_items = world.custom_items.filter((r) => r.list_id !== value);
                return { error: null };
              }

              const list = table(name as keyof World);
              const index = list.findIndex((r) => r.id === value);
              if (index >= 0) list.splice(index, 1);
              return { error: null };
            },
          };
        },
      };
    },
    /*
     * Stands in for the security-definer functions, which is where clearing a
     * tier picture moved when migration 016 took column-level UPDATE on
     * image_path away from clients. The fake mirrors the real contract: it
     * returns the path it cleared, so the caller still has something to
     * collect, and it nulls the column the way the function does.
     */
    async rpc(name: string, args: Record<string, unknown>) {
      order.push(`rpc ${name}`);

      if (name === "clear_tier_row_image") {
        if (world.writeFails) return { data: null, error: { message: "no connection" } };

        const row = table("custom_tier_rows").find((r) => r.id === args.p_row_id);
        if (!row) return { data: null, error: null };

        const previous = row.image_path ?? null;
        row.image_path = null;
        return { data: previous, error: null };
      }

      /*
       * Migration 029: a client can no longer delete a card at all. The
       * function decides — a card some publication's snapshot names is
       * detached and keeps its row (and therefore its picture, and therefore
       * its file); anything else is deleted outright, as before.
       */
      if (name === "remove_custom_item") {
        if (world.writeFails) return { data: null, error: { message: "no connection" } };

        const itemId = args.p_item_id as string;
        const items = table("custom_items");
        const index = items.findIndex((r) => r.id === itemId);
        if (index < 0) return { data: "missing", error: null };

        const item = items[index];
        const named =
          (world.publishedItems ?? []).includes(itemId) ||
          (world.publishedItems === undefined &&
            (world.published ?? []).includes(item.list_id ?? ""));

        if (named) {
          item.detached_at = new Date().toISOString();
          return { data: "detached", error: null };
        }

        items.splice(index, 1);
        return { data: "deleted", error: null };
      }

      if (name === "clear_custom_board") {
        if (world.writeFails) return { data: null, error: { message: "no connection" } };

        const listId = args.p_list_id as string;
        let deleted = 0;
        world.custom_items = table("custom_items").filter((r) => {
          if (r.list_id !== listId) return true;
          const named =
            (world.publishedItems ?? []).includes(r.id) ||
            (world.publishedItems === undefined && (world.published ?? []).includes(listId));
          if (named) {
            r.detached_at = new Date().toISOString();
            return true;
          }
          deleted += 1;
          return false;
        });
        return { data: deleted, error: null };
      }

      if (name === "delete_custom_board") {
        if (world.writeFails) return { data: null, error: { message: "no connection" } };

        const listId = args.p_list_id as string;
        // What the foreign keys do: the board takes its tiers and its cards
        // with it. Without this the fake would report every file as still
        // referenced and never delete anything.
        world.custom_tier_rows = world.custom_tier_rows.filter((r) => r.list_id !== listId);
        world.custom_items = world.custom_items.filter((r) => r.list_id !== listId);
        const hadPost = (world.published ?? []).includes(listId);
        world.published = (world.published ?? []).filter((id) => id !== listId);
        return { data: hadPost, error: null };
      }

      return { data: null, error: null };
    },
    storage: {
      from() {
        return {
          remove: async (paths: string[]) => {
            order.push("storage.remove");
            if (world.storageThrows) throw new Error("bucket unavailable");
            removed.push(paths);
            return { error: null };
          },
        };
      },
    },
  };

  return { client: client as unknown as SupabaseClient, removed, inserted, order };
}

describe("a new tier lands after the last one", () => {
  it("takes the position after the highest, not the number of tiers", async () => {
    // The board that produced the bug: a tier was deleted, so three tiers hold
    // positions 0, 1 and 4. Counting them gives 3, which is taken; 5 is not.
    const { client, inserted } = fakeClient({
      custom_tier_rows: [
        { id: "r1", list_id: "l1", image_path: null, position: 0 },
        { id: "r2", list_id: "l1", image_path: null, position: 1 },
        { id: "r3", list_id: "l1", image_path: null, position: 4 },
      ],
      custom_items: [],
    });

    await addTierRow(client, "l1");

    expect(inserted[0]).toMatchObject({ list_id: "l1", position: 5 });
  });

  it("starts at nought on a board with no tiers", async () => {
    const { client, inserted } = fakeClient({ custom_tier_rows: [], custom_items: [] });
    await addTierRow(client, "l1");
    expect(inserted[0]).toMatchObject({ position: 0 });
  });
});

describe("deleting a card takes its picture with it", () => {
  it("removes the file once nothing points at it", async () => {
    const { client, removed, order } = fakeClient({
      custom_items: [{ id: "i1", list_id: "l1", image_path: "u/l/one.jpg" }],
      custom_tier_rows: [],
    });

    await deleteItem(client, "i1");

    expect(removed).toEqual([["u/l/one.jpg"]]);
    // The row first, the file after. The other order would delete somebody's
    // picture and then fail to delete the card that shows it.
    expect(order).toEqual(["rpc remove_custom_item", "storage.remove"]);
  });

  it("keeps the file when a published post still shows the card", async () => {
    // The reversal, at the layer that used to defeat it: the collector asks
    // the database what still references a path, and a detached row still
    // does — so the file survives without the collector knowing publications
    // exist at all.
    const { client, removed } = fakeClient({
      custom_items: [{ id: "i1", list_id: "l1", image_path: "u/l/published.jpg" }],
      custom_tier_rows: [],
      publishedItems: ["i1"],
    });

    await deleteItem(client, "i1");

    expect(removed).toEqual([]);
  });

  it("clearing a board deletes the unpublished cards' files and keeps the published one", async () => {
    const { client, removed } = fakeClient({
      custom_items: [
        { id: "i1", list_id: "l1", image_path: "u/l/published.jpg" },
        { id: "i2", list_id: "l1", image_path: "u/l/draft.jpg" },
      ],
      custom_tier_rows: [],
      publishedItems: ["i1"],
    });

    await clearCustomBoard(client, "l1");

    expect(removed).toEqual([["u/l/draft.jpg"]]);
  });

  it("leaves the file alone while another row still refers to it", async () => {
    const { client, removed } = fakeClient({
      custom_items: [
        { id: "i1", list_id: "l1", image_path: "u/l/shared.jpg" },
        { id: "i2", list_id: "l1", image_path: "u/l/shared.jpg" },
      ],
      custom_tier_rows: [],
    });

    await deleteItem(client, "i1");

    // Paths are unique today; this is what keeps a future duplicate feature
    // from tearing the picture out of a card that is still on a board.
    expect(removed).toEqual([]);
  });

  it("does not touch the bucket when the row could not be deleted", async () => {
    const { client, removed } = fakeClient({
      custom_items: [{ id: "i1", list_id: "l1", image_path: "u/l/one.jpg" }],
      custom_tier_rows: [],
      writeFails: true,
    });

    await deleteItem(client, "i1");

    expect(removed).toEqual([]);
  });

  it("still finishes when the bucket is unavailable", async () => {
    const { client } = fakeClient({
      custom_items: [{ id: "i1", list_id: "l1", image_path: "u/l/one.jpg" }],
      custom_tier_rows: [],
      storageThrows: true,
    });

    // The card is already gone, which is what was asked for. A storage outage
    // must not turn that into an error the reader has to understand.
    await expect(deleteItem(client, "i1")).resolves.toBeUndefined();
  });
});

describe("deleting a tier", () => {
  it("removes its own picture and leaves its cards' pictures alone", async () => {
    const { client, removed } = fakeClient({
      custom_tier_rows: [{ id: "r1", list_id: "l1", image_path: "u/l/tier.jpg", position: 0 }],
      // The card survives the tier — the foreign key sets it adrift into the
      // pool — so its picture is still spoken for.
      custom_items: [{ id: "i1", list_id: "l1", image_path: "u/l/card.jpg" }],
    });

    await deleteTierRow(client, "r1");

    expect(removed).toEqual([["u/l/tier.jpg"]]);
  });
});

describe("taking a picture off a tier", () => {
  it("removes the file, not only the reference", async () => {
    const { client, removed, order } = fakeClient({
      custom_tier_rows: [{ id: "r1", list_id: "l1", image_path: "u/l/tier.jpg", position: 0 }],
      custom_items: [],
    });

    await clearTierRowImage(client, "r1");

    expect(removed).toEqual([["u/l/tier.jpg"]]);
    // Through the RPC now, not a direct update: image_path stopped being a
    // column any client may write in migration 016. The ordering matters for
    // the same reason it always did — the path has to be read back before the
    // file can be collected.
    expect(order).toEqual(["rpc clear_tier_row_image", "storage.remove"]);
  });

  it("collects nothing when the write is refused", async () => {
    // An unauthorised or blocked row answers with an error, and the file must
    // not be deleted on the strength of a clear that did not happen.
    const { client, removed } = fakeClient({
      custom_tier_rows: [{ id: "r1", list_id: "l1", image_path: "u/l/tier.jpg", position: 0 }],
      custom_items: [],
      writeFails: true,
    });

    await clearTierRowImage(client, "r1");

    expect(removed).toEqual([]);
  });
});

describe("deleting a whole board", () => {
  it("collects every picture before the cascade removes the rows", async () => {
    const { client, removed } = fakeClient({
      custom_tier_rows: [{ id: "r1", list_id: "l1", image_path: "u/l/tier.jpg", position: 0 }],
      custom_items: [{ id: "i1", list_id: "l1", image_path: "u/l/card.jpg" }],
    });

    const outcome = await deleteCustomBoard(client, "l1");

    expect(outcome).toEqual({ removedPost: false });
    expect(removed).toHaveLength(1);
    expect([...removed[0]].sort()).toEqual(["u/l/card.jpg", "u/l/tier.jpg"]);
  });

  it("goes through the RPC rather than deleting the row directly", async () => {
    // Not a style preference: a plain `delete from custom_tier_lists` cascades
    // away the publication row but not the post itself (posts has no foreign
    // key back to the board), which would leave a published post behind with
    // nothing left to render. Only the RPC knows to take the post with it.
    const { client, order } = fakeClient({ custom_tier_rows: [], custom_items: [] });

    await deleteCustomBoard(client, "l1");

    expect(order).toContain("rpc delete_custom_board");
    expect(order).not.toContain("delete custom_tier_lists");
  });

  it("reports that a published board's post was removed too", async () => {
    const { client, removed } = fakeClient({
      custom_tier_rows: [],
      custom_items: [{ id: "i1", list_id: "l1", image_path: "u/l/card.jpg" }],
      published: ["l1"],
    });

    const outcome = await deleteCustomBoard(client, "l1");

    expect(outcome).toEqual({ removedPost: true });
    expect(removed).toHaveLength(1);
  });

  it("surfaces a refusal instead of touching storage", async () => {
    // A blocked board, or one that belongs to someone else: the RPC itself
    // decides, and its message is a sentence someone can act on.
    const { client, removed } = fakeClient({
      custom_tier_rows: [],
      custom_items: [{ id: "i1", list_id: "l1", image_path: "u/l/card.jpg" }],
      writeFails: true,
    });

    const outcome = await deleteCustomBoard(client, "l1");

    expect(outcome).toEqual({ error: "no connection" });
    // Nothing was actually removed, so nothing should be swept as an orphan.
    expect(removed).toEqual([]);
  });
});
