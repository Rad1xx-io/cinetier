import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two fixes from .ai/reports/battle-widget-audit.md, both about
 * lib/supabase/battles.ts and easy to accidentally undo later since neither
 * has a visible symptom on the happy path:
 *
 *   - getBattleParticipants must sort ties deterministically. Postgres makes
 *     no promise about the order of rows that agree on every explicit sort
 *     key, so a leaderboard ordered by match_score alone can hand the trophy
 *     to a different tied participant on every read.
 *   - submitBattleResult must not swallow an insert failure silently. The
 *     participant still sees their result either way (that is deliberate,
 *     see the function's own comment) — but the failure has to be visible
 *     *somewhere*, or a real outage looks identical to a quiet Tuesday.
 */

const orderCalls: Array<[string, { ascending: boolean }]> = [];
let insertError: { message: string } | null = null;
const insertedRows: unknown[] = [];

function fakeClient() {
  return {
    from(table: string) {
      if (table === "battles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "b1",
                  creator_id: "creator-1",
                  category: "games",
                  items: [{ id: "game-1", title: "A", category: "games" }],
                  creator_ratings: { "game-1": "S" },
                  created_at: "2026-01-01T00:00:00Z",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "battle_participants") {
        return {
          insert: async (row: unknown) => {
            insertedRows.push(row);
            return { error: insertError };
          },
          select: () => ({
            eq: () => {
              const chain = {
                order: (column: string, opts: { ascending: boolean }) => {
                  orderCalls.push([column, opts]);
                  return chain;
                },
                then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
              };
              return chain;
            },
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

let client: unknown = null;
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => client }));
vi.mock("@/lib/supabase/session-store", () => ({
  getSessionSnapshot: () => ({ status: "signed-out" }),
}));
vi.mock("@/lib/analytics/tracker", () => ({ trackEvent: vi.fn() }));

import { getBattleParticipants, submitBattleResult } from "@/lib/supabase/battles";

beforeEach(() => {
  client = fakeClient();
  orderCalls.length = 0;
  insertedRows.length = 0;
  insertError = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getBattleParticipants — leaderboard tie-break", () => {
  it("orders by match_score, then by created_at ascending, as two explicit sort keys", async () => {
    await getBattleParticipants("b1");

    expect(orderCalls).toEqual([
      ["match_score", { ascending: false }],
      ["created_at", { ascending: true }],
    ]);
  });
});

describe("submitBattleResult — a failed insert must not be silent", () => {
  it("logs when the insert fails, and still returns the comparison", async () => {
    insertError = { message: "network blip" };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const comparison = await submitBattleResult("b1", { "game-1": "S" });

    expect(comparison).not.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "TierListOnline: failed to record a battle result",
      insertError
    );
  });

  it("does not log anything when the insert succeeds", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await submitBattleResult("b1", { "game-1": "S" });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(1);
  });
});
