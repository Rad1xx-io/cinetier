import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module under test is server-only, which throws outside a server render.
vi.mock("server-only", () => ({}));

interface Call {
  table: string;
  filters: Record<string, unknown>;
}

const calls: Call[] = [];
/** Queued per table, so a test can make the view fail and the table succeed. */
let results: Record<string, { data: unknown; error: unknown }> = {};

function makeBuilder(table: string) {
  const call: Call = { table, filters: {} };
  calls.push(call);

  const builder: Record<string, unknown> = {
    select: () => builder,
    gte: (col: string, value: unknown) => {
      call.filters[`gte:${col}`] = value;
      return builder;
    },
    eq: (col: string, value: unknown) => {
      call.filters[`eq:${col}`] = value;
      return builder;
    },
    order: (col: string, opts: unknown) => {
      call.filters.order = [col, opts];
      return builder;
    },
    limit: (n: number) => {
      call.filters.limit = n;
      return builder;
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject),
  };
  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

const { listPublicProfiles, MIN_SITEMAP_BOARD_ITEMS } = await import(
  "@/lib/supabase/public-read"
);

const VIEW = "public_profile_sitemap";
const TABLE = "profiles";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  calls.length = 0;
  results = {};
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("listPublicProfiles — the counted view", () => {
  it("reads the view and returns its rows", async () => {
    results[VIEW] = {
      data: [
        { username: "owner", updated_at: "2026-08-13T20:53:26.635Z" },
        { username: "admin", updated_at: "2026-08-13T20:04:57.180Z" },
      ],
      error: null,
    };

    const profiles = await listPublicProfiles();
    expect(profiles.map((p) => p.username)).toEqual(["owner", "admin"]);
    expect(profiles[0].updatedAt.toISOString()).toBe("2026-08-13T20:53:26.635Z");
    expect(calls[0].table).toBe(VIEW);
  });

  it("asks the database to drop the empty boards, not the caller", async () => {
    results[VIEW] = { data: [], error: null };
    await listPublicProfiles();

    // Counting in JS would mean pulling every ranked row for every public user
    // to answer a yes/no question.
    expect(calls[0].filters["gte:items_count"]).toBe(MIN_SITEMAP_BOARD_ITEMS);
    expect(MIN_SITEMAP_BOARD_ITEMS).toBeGreaterThan(0);
  });

  it("takes the freshest first and caps how many it asks for", async () => {
    results[VIEW] = { data: [], error: null };
    await listPublicProfiles(50);

    expect(calls[0].filters.order).toEqual(["updated_at", { ascending: false }]);
    expect(calls[0].filters.limit).toBe(50);
  });
});

describe("listPublicProfiles — before migration 011", () => {
  it("falls back to the plain table when the view does not exist", async () => {
    results[VIEW] = { data: null, error: { code: "42P01", message: "does not exist" } };
    results[TABLE] = {
      data: [{ username: "owner", updated_at: "2026-08-13T20:53:26.635Z" }],
      error: null,
    };

    const profiles = await listPublicProfiles();
    // No profiles at all would be strictly worse than a few thin pages.
    expect(profiles.map((p) => p.username)).toEqual(["owner"]);
    expect(calls.map((c) => c.table)).toEqual([VIEW, TABLE]);
  });

  it("applies is_public itself on that path, since the view is not there to", async () => {
    results[VIEW] = { data: null, error: { code: "42P01", message: "does not exist" } };
    results[TABLE] = { data: [], error: null };

    await listPublicProfiles();
    // The select policy on profiles is open — without this filter a private
    // profile would be advertised to every crawler.
    expect(calls[1].filters["eq:is_public"]).toBe(true);
  });
});

describe("listPublicProfiles — failure", () => {
  it("returns nothing on a real error rather than retrying the table", async () => {
    results[VIEW] = { data: null, error: { code: "PGRST301", message: "jwt expired" } };

    expect(await listPublicProfiles()).toEqual([]);
    expect(calls.map((c) => c.table)).toEqual([VIEW]);
  });

  it("returns nothing when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(await listPublicProfiles()).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("skips a row with no handle instead of emitting /u/undefined", async () => {
    results[VIEW] = {
      data: [{ username: "", updated_at: "2026-08-13T20:53:26.635Z" }, { username: "anya", updated_at: null }],
      error: null,
    };

    const profiles = await listPublicProfiles();
    expect(profiles.map((p) => p.username)).toEqual(["anya"]);
  });

  it("substitutes a usable date for an unparseable one", async () => {
    results[VIEW] = { data: [{ username: "anya", updated_at: "not-a-date" }], error: null };

    const [profile] = await listPublicProfiles();
    // `Invalid Date` would render a <lastmod> no crawler can parse.
    expect(Number.isNaN(profile.updatedAt.getTime())).toBe(false);
  });
});
