import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsEvent, AnalyticsProvider } from "@/lib/analytics/tracker";

/**
 * `publishPost` reaches for its Supabase client and its signed-in user
 * internally rather than taking them as parameters (unlike
 * `publishCustomBoard`, tested separately in activation-funnel.test.ts), so
 * this file mocks those two modules at the top rather than passing a fake
 * client through — the same shape `tier-list-actions-custom-clear.test.tsx`
 * and `post-delete.test.tsx` already use for the same reason.
 */

let postCount = 0;

function fakeClient() {
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
    return { insert: async () => ({ error: null }) };
  });
  return { from } as unknown as SupabaseClient;
}

vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => fakeClient() }));
vi.mock("@/lib/supabase/session-store", () => ({
  getSessionSnapshot: () => ({ status: "signed-in", user: { id: "u1" } }),
}));

const { publishPost } = await import("@/lib/supabase/feed");
const { clearProviders, registerProvider } = await import("@/lib/analytics/tracker");

function collector(): { provider: AnalyticsProvider; events: AnalyticsEvent[] } {
  const events: AnalyticsEvent[] = [];
  return { events, provider: { name: `collector-${Math.random()}`, send: (e) => { events.push(e); } } };
}

beforeEach(() => {
  postCount = 0;
  clearProviders();
});
afterEach(() => vi.restoreAllMocks());

describe("first_post_published — a ranked list as the first publish", () => {
  it("fires with post_type 'tier_list' on this account's first post", async () => {
    const { provider, events } = collector();
    registerProvider(provider);

    const outcome = await publishPost({ title: "My list", description: "", category: "movie", titles: [] });

    expect(outcome.ok).toBe(true);
    const fired = events.filter((e) => e.event === "first_post_published");
    expect(fired).toHaveLength(1);
    expect(fired[0].properties).toEqual({ post_type: "tier_list" });
  });

  it("does not fire on a second post from the same account", async () => {
    await publishPost({ title: "First list", description: "", category: "movie", titles: [] });

    const { provider, events } = collector();
    registerProvider(provider);
    await publishPost({ title: "Second list", description: "", category: "tv", titles: [] });

    expect(events.map((e) => e.event)).not.toContain("first_post_published");
  });
});
