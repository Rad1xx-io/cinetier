import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsEvent, AnalyticsProvider } from "@/lib/analytics/tracker";
import { clearProviders, registerProvider } from "@/lib/analytics/tracker";
import { addTitle, getRatedTitles } from "@/lib/storage";
import { isFirstPostForUser } from "@/lib/supabase/feed";
import { publishCustomBoard } from "@/lib/supabase/custom-lists";
import type { CustomBoard } from "@/lib/types/custom-list";

/**
 * Each "first_*" event rests on a fact read at the moment of the write, not on
 * a remembered flag — the report asked this to be checked, not assumed, so
 * every test here drives the real function twice and shows the second call
 * does not refire.
 */

function collector(): { provider: AnalyticsProvider; events: AnalyticsEvent[] } {
  const events: AnalyticsEvent[] = [];
  return { events, provider: { name: `collector-${Math.random()}`, send: (e) => { events.push(e); } } };
}

beforeEach(() => {
  window.localStorage.clear();
  clearProviders();
});
afterEach(() => vi.restoreAllMocks());

describe("first_title_ranked — the local board's own count, checked before the write", () => {
  it("fires on the title that takes the board from nothing to one", () => {
    const { provider, events } = collector();
    registerProvider(provider);

    addTitle({ tmdbId: 1, mediaType: "movie", title: "First", posterPath: null, releaseDate: null });

    expect(events.map((e) => e.event)).toContain("first_title_ranked");
  });

  it("does not fire again for a second, different title", () => {
    addTitle({ tmdbId: 1, mediaType: "movie", title: "First", posterPath: null, releaseDate: null });

    const { provider, events } = collector();
    registerProvider(provider);
    addTitle({ tmdbId: 2, mediaType: "movie", title: "Second", posterPath: null, releaseDate: null });

    expect(events.map((e) => e.event)).not.toContain("first_title_ranked");
  });

  it("does not fire when the 'first' add is really a duplicate of an existing row", () => {
    addTitle({ tmdbId: 1, mediaType: "movie", title: "First", posterPath: null, releaseDate: null });
    expect(getRatedTitles()).toHaveLength(1);

    const { provider, events } = collector();
    registerProvider(provider);
    // Same tmdbId + mediaType: the repository returns the existing row rather
    // than creating a second one, so the board never actually left "1".
    addTitle({ tmdbId: 1, mediaType: "movie", title: "First", posterPath: null, releaseDate: null });

    expect(getRatedTitles()).toHaveLength(1);
    expect(events.map((e) => e.event)).not.toContain("first_title_ranked");
  });
});

describe("isFirstPostForUser — the database's own count, checked before the write", () => {
  function fakeSupabase(existingPostIds: string[]) {
    const from = vi.fn((table: string) => {
      if (table !== "posts") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: existingPostIds.map((id) => ({ id })) }),
          }),
        }),
      };
    });
    return { from } as unknown as SupabaseClient;
  }

  it("is true for an account with no posts", async () => {
    expect(await isFirstPostForUser(fakeSupabase([]), "u1")).toBe(true);
  });

  it("is false the moment one post already exists", async () => {
    expect(await isFirstPostForUser(fakeSupabase(["existing-post"]), "u1")).toBe(false);
  });
});

describe("first_post_published — a custom board as the first publish", () => {
  function board(): CustomBoard {
    return {
      list: { id: "l1", userId: "u1", title: "My board", isPublic: true, hiddenAt: null, updatedAt: "2026-01-01" },
      rows: [{ id: "r1", listId: "l1", position: 0, label: "S", color: "#ef4444", imagePath: null, imageUrl: null }],
      // Non-empty: an empty board is refused before any of this runs (see
      // custom-board-empty-publish.test.tsx), and these tests are about the
      // first-post event, not about that refusal.
      items: [
        { id: "i1", listId: "l1", rowId: "r1", position: 0, caption: "", imagePath: "l1/i1.jpg", imageUrl: null, hiddenAt: null },
      ],
      canEdit: true,
    };
  }

  /** A fake client whose `posts` table starts with `existingPosts` rows for u1. */
  function fakeSupabase(existingPosts: number) {
    let postCount = existingPosts;
    const from = vi.fn((table: string) => {
      if (table === "posts") {
        return {
          select: () => ({ eq: () => ({ limit: async () => ({ data: Array(postCount).fill({ id: "x" }) }) }) }),
          insert: () => ({
            select: () => ({
              single: async () => {
                postCount += 1;
                return { data: { id: `post-${postCount}` }, error: null };
              },
            }),
          }),
          delete: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      // The snapshot table: accept the insert unconditionally.
      return { insert: async () => ({ error: null }) };
    });
    return { from } as unknown as SupabaseClient;
  }

  it("fires with post_type 'custom' when it is somebody's first publish", async () => {
    const { provider, events } = collector();
    registerProvider(provider);

    await publishCustomBoard(fakeSupabase(0), board(), "My board title", "", true);

    const fired = events.filter((e) => e.event === "first_post_published");
    expect(fired).toHaveLength(1);
    expect(fired[0].properties).toEqual({ post_type: "custom" });
  });

  it("does not fire a second time when that same account publishes again", async () => {
    const client = fakeSupabase(0);
    await publishCustomBoard(client, board(), "First board", "", true);

    const { provider, events } = collector();
    registerProvider(provider);
    await publishCustomBoard(client, board(), "Second board", "", true);

    expect(events.map((e) => e.event)).not.toContain("first_post_published");
  });

  it("does not fire when the account already had a post before this one", async () => {
    const { provider, events } = collector();
    registerProvider(provider);

    // fakeSupabase(1): one post already on record for this user.
    await publishCustomBoard(fakeSupabase(1), board(), "Second board ever", "", true);

    expect(events.map((e) => e.event)).not.toContain("first_post_published");
  });
});
