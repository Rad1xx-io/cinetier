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
    // A single row (or null), not an array — distinct from `.then()` below
    // since `getPublicTierListServer`'s profile lookup and the sitemap's
    // list queries want different shapes off the same table name.
    maybeSingle: () => Promise.resolve(results[`${table}:single`] ?? { data: null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject),
  };
  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

const { listPublicProfiles, MIN_SITEMAP_BOARD_ITEMS, getPublicTierListServer, getInitialFeed } =
  await import("@/lib/supabase/public-read");

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

describe("getPublicTierListServer — /u/[username]'s server-rendered first paint", () => {
  const PROFILE_ROW = {
    id: "user-1",
    username: "anya",
    display_name: "Anya",
    is_public: true,
    allow_fork: true,
    donation_url: null,
  };

  it("reads the profile, titles, channels and criteria scores in one go", async () => {
    results["profiles:single"] = { data: PROFILE_ROW, error: null };
    results["ranked_titles"] = {
      data: [
        {
          id: "rating-1",
          tmdb_id: 27205,
          media_type: "movie",
          title: "Inception",
          poster_path: "/p.jpg",
          release_date: "2010-07-16",
          tier: "S",
          order: 0,
          vote_average: 8.4,
          added_at: 1,
          updated_at: 2,
        },
      ],
      error: null,
    };
    results["ranked_channels"] = {
      data: [
        {
          channel_id: "chan-1",
          title: "A Channel",
          thumbnail_url: null,
          country: null,
          tier: "A",
          order: 0,
          subscriber_count: 10,
          added_at: 1,
          updated_at: 2,
        },
      ],
      error: null,
    };
    results["criteria_scores"] = {
      data: [{ rating_id: "rating-1", criterion_id: "acting", name: "Acting", score: 9.5 }],
      error: null,
    };

    const result = await getPublicTierListServer("anya");

    expect(result?.profile).toEqual({
      id: "user-1",
      username: "anya",
      displayName: "Anya",
      isPublic: true,
      allowFork: true,
      donationUrl: null,
    });
    expect(result?.titles).toHaveLength(1);
    expect(result?.titles[0]).toMatchObject({
      tmdbId: 27205,
      mediaType: "movie",
      tier: "S",
      criteriaScores: [{ criterionId: "acting", name: "Acting", score: 9.5 }],
    });
    expect(result?.channels[0]).toMatchObject({ channelId: "chan-1", tier: "A" });
  });

  it("looks the username up lower-cased, the same normalisation the client version applies", async () => {
    results["profiles:single"] = { data: PROFILE_ROW, error: null };
    results["ranked_titles"] = { data: [], error: null };
    results["ranked_channels"] = { data: [], error: null };
    results["criteria_scores"] = { data: [], error: null };

    await getPublicTierListServer("ANYA");

    expect(calls[0].filters["eq:username"]).toBe("anya");
  });

  it("returns null, and never queries the board, for a profile that isn't public", async () => {
    results["profiles:single"] = { data: { ...PROFILE_ROW, is_public: false }, error: null };

    const result = await getPublicTierListServer("anya");

    expect(result).toBeNull();
    // RLS (migration 021) can still hand back a private profile's row when
    // its owner has posted — the application-level check above, not the
    // database, is what has to stop the board itself from being read.
    expect(calls.map((c) => c.table)).toEqual(["profiles"]);
  });

  it("returns null when no profile matches the username", async () => {
    const result = await getPublicTierListServer("nobody");
    expect(result).toBeNull();
  });

  it("returns null when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(await getPublicTierListServer("anya")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("getInitialFeed — /feed's server-rendered first paint", () => {
  const FEED_ROW = {
    id: "post-1",
    user_id: "user-1",
    username: "anya",
    display_name: "Anya",
    title: "My favourite films",
    description: "",
    category: "movie",
    views_count: 3,
    likes_count: "2", // bigint counts arrive as strings over PostgREST
    comments_count: "0",
    is_public: true,
    allow_fork: true,
    donation_url: null,
    created_at: "2026-09-01T00:00:00.000Z",
  };

  it("reads the feed's first page, newest first, in the shape FeedView already expects", async () => {
    results["post_feed"] = { data: [FEED_ROW], error: null };

    const posts = await getInitialFeed();

    expect(posts).toEqual([
      {
        id: "post-1",
        userId: "user-1",
        username: "anya",
        displayName: "Anya",
        title: "My favourite films",
        description: "",
        category: "movie",
        viewsCount: 3,
        likesCount: 2,
        commentsCount: 0,
        isPublic: true,
        allowFork: true,
        donationUrl: null,
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
    expect(calls[0].table).toBe("post_feed");
    expect(calls[0].filters.order).toEqual(["created_at", { ascending: false }]);
    expect(calls[0].filters.limit).toBe(24);
  });

  it("normalises a category the app does not recognise to mixed, the same as getFeed", async () => {
    results["post_feed"] = { data: [{ ...FEED_ROW, category: "not-a-real-category" }], error: null };

    const [post] = (await getInitialFeed())!;
    expect(post.category).toBe("mixed");
  });

  it("accepts a smaller page size", async () => {
    results["post_feed"] = { data: [], error: null };
    await getInitialFeed(5);
    expect(calls[0].filters.limit).toBe(5);
  });

  it("returns null, not an empty array, when the read fails — so the caller can fall back to the client fetch instead of showing an incorrect empty feed", async () => {
    results["post_feed"] = { data: null, error: { message: "boom" } };
    expect(await getInitialFeed()).toBeNull();
  });

  it("returns null when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(await getInitialFeed()).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
