import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { forkCustomBoard, getCustomBoard } from "@/lib/supabase/custom-lists";

/** A promise that also carries the builder methods, the way postgrest-js does. */
function thenable<T>(value: T, extra: Record<string, unknown> = {}) {
  return Object.assign(Promise.resolve(value), extra) as never;
}

describe("forkCustomBoard — copying the shape, not the board", () => {
  function fakeClient(opts: { insertRowsFails?: boolean } = {}) {
    const inserted: Record<string, Record<string, unknown>[]> = {};
    const from = vi.fn((table: string) => ({
      insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        inserted[table] = [...(inserted[table] ?? []), ...rows];
        return {
          select: () => ({
            single: async () =>
              table === "custom_tier_lists"
                ? { data: { id: "new-board" }, error: null }
                : { data: null, error: null },
          }),
          then: (resolve: (v: { error: unknown }) => void) =>
            resolve({ error: opts.insertRowsFails && table === "custom_tier_rows" ? { message: "boom" } : null }),
        };
      },
    }));
    return { client: { from } as unknown as SupabaseClient, inserted };
  }

  it("creates a new board owned by the forker, titled from the source", async () => {
    const { client, inserted } = fakeClient();

    const outcome = await forkCustomBoard(client, "forker-1", "Fork of Someone's board", [
      { label: "S", color: "#ef4444" },
      { label: "A", color: "#f59e0b" },
    ]);

    expect(outcome).toEqual({ id: "new-board" });
    expect(inserted.custom_tier_lists).toEqual([{ user_id: "forker-1", title: "Fork of Someone's board" }]);
  });

  it("copies label and colour, in order, and nothing else — no images, ever", async () => {
    const { client, inserted } = fakeClient();

    await forkCustomBoard(client, "forker-1", "Fork", [
      { label: "S", color: "#ef4444" },
      { label: "A", color: "#f59e0b" },
    ]);

    expect(inserted.custom_tier_rows).toEqual([
      { list_id: "new-board", position: 0, label: "S", color: "#ef4444" },
      { list_id: "new-board", position: 1, label: "A", color: "#f59e0b" },
    ]);
    // The type itself carries only label/colour — asserted here as the
    // behaviour that guarantees it: nothing resembling a path or a url ever
    // reaches the insert.
    expect(JSON.stringify(inserted.custom_tier_rows)).not.toMatch(/image|path|url/i);
  });

  it("falls back to the app's own starter tiers when the source board has none", async () => {
    const { client, inserted } = fakeClient();

    await forkCustomBoard(client, "forker-1", "Fork", []);

    expect(inserted.custom_tier_rows!.length).toBeGreaterThan(0);
  });

  it("reports a failure rather than leaving a titleless, tierless board behind", async () => {
    const { client } = fakeClient({ insertRowsFails: true });

    const outcome = await forkCustomBoard(client, "forker-1", "Fork", [{ label: "S", color: "#ef4444" }]);

    expect(outcome).toEqual({ error: expect.any(String) });
  });
});

describe("getCustomBoard — whether a viewer may fork what they are looking at", () => {
  function fakeClient(profileResult: { data: { allow_fork: boolean | null } | null }) {
    const from = vi.fn((table: string) => {
      if (table === "custom_tier_lists") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "board-1",
                  user_id: "owner-1",
                  title: "A board",
                  is_public: true,
                  hidden_at: null,
                  updated_at: "2026-01-01T00:00:00Z",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "custom_tier_rows" || table === "custom_items") {
        // `custom_items` gained `.is("detached_at", null)` when publications
        // started keeping removed cards alive (migration 029); tier rows never
        // needed it. One shared shape, so the chain works either way.
        const order = () => thenable({ data: [], error: null });
        return { select: () => ({ eq: () => ({ order, is: () => ({ order }) }) }) };
      }
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => profileResult }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    });
    return { from } as unknown as SupabaseClient;
  }

  it("is false for the owner's own view — the question does not apply to them", async () => {
    // A row that would say `true` if it were ever read, to prove it genuinely
    // is not: the owner's own view must not even ask.
    const client = fakeClient({ data: { allow_fork: true } });

    const board = await getCustomBoard(client, "board-1", "owner-1");

    expect(board!.allowFork).toBe(false);
  });

  it("reflects a real allow_fork value for a viewer who is not the owner", async () => {
    const client = fakeClient({ data: { allow_fork: false } });

    const board = await getCustomBoard(client, "board-1", "someone-else");

    expect(board!.allowFork).toBe(false);
  });

  it("defaults to true when the column is unset on an otherwise-visible profile", async () => {
    // A pre-migration account: the row exists, `allow_fork` was never given a
    // value.
    const client = fakeClient({ data: { allow_fork: null } });

    const board = await getCustomBoard(client, "board-1", "someone-else");

    expect(board!.allowFork).toBe(true);
  });

  it("defaults to false when the owner's profile cannot be read at all", async () => {
    // Not the same case as the one above: no row came back, because RLS
    // (is_public or own or has posted) hid it — a public board can belong to
    // an owner with a private profile who has never posted. An owner's
    // preference this function cannot verify is not a preference it can
    // honour, so this fails toward NOT offering the fork, not toward
    // offering it — the opposite default from the "column is null" case.
    const client = fakeClient({ data: null });

    const board = await getCustomBoard(client, "board-1", "someone-else");

    expect(board!.allowFork).toBe(false);
  });
});
