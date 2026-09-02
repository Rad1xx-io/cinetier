import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";
import { safeDonationUrl } from "@/lib/utils/donation-url";
import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import type { CriterionScore } from "@/lib/types/criteria";
import type { PublicTierList } from "@/lib/supabase/profiles";
import type { FeedPost, PostCategory } from "@/lib/supabase/feed";

/**
 * An anonymous, session-less Supabase client for things the server renders the
 * same way for everybody.
 *
 * Deliberately not `getSupabaseServerClient`: that one reads `cookies()`, which
 * would tie a sitemap to whoever happened to request it and force the route to
 * be rendered per visitor. Nothing here depends on who is asking, and RLS is
 * what decides what comes back either way.
 */
function getPublicClient() {
  if (!isSupabaseConfigured()) return null;
  const { url, anonKey } = getSupabaseEnv();
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface PublicProfileRef {
  username: string;
  /** The profile's own `updated_at`, so the sitemap can date each entry truthfully. */
  updatedAt: Date;
}

/**
 * A catalogue page somebody has actually ranked.
 *
 * There is no catalogue table in this database — /title, /anime and /games are
 * views onto TMDB, AniList and IGDB. The only ids this app knows about are the
 * ones its users put on a board, so those are what the sitemap can offer.
 */
export interface RankedEntryRef {
  /** Route-ready: "movie-27205", "16498", "1091500", or a channel id. */
  slug: string;
  updatedAt: Date;
}

/** Shared ceiling per catalogue. A sitemap caps at 50,000 URLs in total. */
export const RANKED_ENTRY_LIMIT = 10_000;

function toDate(value: string | null | undefined): Date {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

/**
 * Keeps one entry per id, dated by the most recent time anyone touched it.
 *
 * The same film sits on many boards, and each copy carries its own timestamp.
 * The freshest is the honest `lastmod` for a page whose content is the film,
 * not the ranking.
 */
function newestPerSlug(rows: { slug: string; updated: string | null }[]): RankedEntryRef[] {
  const best = new Map<string, Date>();
  for (const row of rows) {
    if (!row.slug) continue;
    const at = toDate(row.updated);
    const seen = best.get(row.slug);
    if (!seen || at > seen) best.set(row.slug, at);
  }
  return [...best.entries()].map(([slug, updatedAt]) => ({ slug, updatedAt }));
}

/**
 * Sitemaps cap at 50,000 URLs. This sits far below that while still being more
 * profiles than the app is likely to hold for a long while; the ordering below
 * makes sure it is the freshest ones that survive the cut if it is ever hit.
 */
export const PUBLIC_PROFILE_LIMIT = 10_000;

/**
 * How much of a board makes a page worth offering a search engine.
 *
 * One entry is the literal reading of "not empty". Raise it to 3–5 if the index
 * starts filling with near-empty boards: a page holding a single poster is thin
 * content, and enough of them drags down the pages that are not.
 */
export const MIN_SITEMAP_BOARD_ITEMS = 1;

interface ProfileRow {
  username: string;
  updated_at: string | null;
}

function toRef(row: ProfileRow): PublicProfileRef[] {
  if (!row.username) return [];
  const updated = row.updated_at ? new Date(row.updated_at) : null;
  return [
    {
      username: row.username,
      // A row written before `updated_at` had a default would otherwise produce
      // `Invalid Date` and an unparseable <lastmod>.
      updatedAt: updated && !Number.isNaN(updated.getTime()) ? updated : new Date(),
    },
  ];
}

type Client = NonNullable<ReturnType<typeof getPublicClient>>;

/**
 * The path taken before migration 011 has been applied: every published
 * profile, empty boards included.
 *
 * Kept as a fallback rather than removed, because the alternative on a database
 * still missing the view is a sitemap with no profiles in it at all — strictly
 * worse than one carrying a few thin pages.
 */
async function listWithoutCounts(client: Client, limit: number): Promise<PublicProfileRef[]> {
  const { data, error } = await client
    .from("profiles")
    .select("username,updated_at")
    // `is_public` is the owner's own switch. The select policy on this table is
    // open, so the filter has to be explicit — RLS will not do it here.
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as ProfileRow[]).flatMap(toRef);
}

/**
 * Published profiles whose board actually holds something.
 *
 * Never throws. A sitemap that 500s is worse than a short one: the static
 * routes are still worth serving when the database is unreachable, and a build
 * must not fail because Supabase was slow for a moment.
 */
export async function listPublicProfiles(
  limit = PUBLIC_PROFILE_LIMIT
): Promise<PublicProfileRef[]> {
  const supabase = getPublicClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("public_profile_sitemap")
      .select("username,updated_at,items_count")
      // The view already filters on is_public; this is the empty-board cut.
      .gte("items_count", MIN_SITEMAP_BOARD_ITEMS)
      .order("updated_at", { ascending: false })
      .limit(limit);

    // 42P01 is Postgres' undefined_table, which here means migration 011 has
    // not been run yet. Anything else is a real failure and gets the same
    // treatment as an outage.
    if (error?.code === "42P01" || error?.message?.includes("public_profile_sitemap")) {
      return listWithoutCounts(supabase, limit);
    }
    if (error || !data) return [];

    return (data as ProfileRow[]).flatMap(toRef);
  } catch {
    return [];
  }
}

/**
 * Every catalogue page reachable from a published board, grouped by the route
 * that renders it.
 *
 * One query, not one per media type: `ranked_titles` holds films, series, anime
 * and games together, and splitting them is a `switch` rather than a round trip.
 * RLS does the access control — the anonymous key sees a ranked row only when
 * its owner published their profile — so nothing here can leak a private board.
 *
 * Never throws. A sitemap missing its dynamic half still beats a 500.
 */
export async function listRankedEntries(limit = RANKED_ENTRY_LIMIT): Promise<{
  titles: RankedEntryRef[];
  anime: RankedEntryRef[];
  games: RankedEntryRef[];
}> {
  const supabase = getPublicClient();
  const empty = { titles: [], anime: [], games: [] };
  if (!supabase) return empty;

  try {
    const { data, error } = await supabase
      .from("ranked_titles")
      .select("tmdb_id,media_type,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error || !data) return empty;

    const rows = data as { tmdb_id: number; media_type: string; updated_at: string | null }[];
    const titles: { slug: string; updated: string | null }[] = [];
    const anime: { slug: string; updated: string | null }[] = [];
    const games: { slug: string; updated: string | null }[] = [];

    for (const row of rows) {
      if (!Number.isFinite(row.tmdb_id)) continue;
      // Mirrors titleHref in lib/utils/title-route.ts — /title carries the media
      // type in its slug because one route serves both of TMDB's kinds.
      switch (row.media_type) {
        case "movie":
        case "tv":
          titles.push({ slug: `${row.media_type}-${row.tmdb_id}`, updated: row.updated_at });
          break;
        case "anime":
          anime.push({ slug: String(row.tmdb_id), updated: row.updated_at });
          break;
        case "game":
          games.push({ slug: String(row.tmdb_id), updated: row.updated_at });
          break;
      }
    }

    return {
      titles: newestPerSlug(titles),
      anime: newestPerSlug(anime),
      games: newestPerSlug(games),
    };
  } catch {
    return empty;
  }
}

/** YouTube channels on a published board. Their own table, their own route. */
export async function listRankedChannels(limit = RANKED_ENTRY_LIMIT): Promise<RankedEntryRef[]> {
  const supabase = getPublicClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("ranked_channels")
      .select("channel_id,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    const rows = data as { channel_id: string; updated_at: string | null }[];
    return newestPerSlug(rows.map((r) => ({ slug: r.channel_id, updated: r.updated_at })));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------- public pages --

interface PublicProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  is_public: boolean;
  allow_fork: boolean | null;
  donation_url: string | null;
}

interface PublicCriterionRow {
  rating_id: string;
  criterion_id: string;
  name: string;
  score: number;
}

interface PublicTitleRow {
  id: string;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  tier: TierOrUnrated;
  order: number;
  vote_average: number | null;
  added_at: number;
  updated_at: number;
}

interface PublicChannelRow {
  channel_id: string;
  title: string;
  thumbnail_url: string | null;
  country: string | null;
  tier: TierOrUnrated;
  order: number;
  subscriber_count: number | null;
  added_at: number;
  updated_at: number;
}

/**
 * `getPublicTierList`'s server-rendered twin — same query, same row mapping,
 * same output shape, so `<PublicTierListView>` never had to change its types
 * to accept it.
 *
 * Not a call to that function itself: `lib/supabase/profiles.ts` carries a
 * `"use client"` directive, and Next replaces a client module's exports with
 * opaque client references the moment a Server Component imports them —
 * calling one directly from here would fail at runtime. Only the *types* it
 * exports (`PublicTierList`) cross that boundary safely, since types are
 * erased before either bundle exists; the query itself has to be
 * reimplemented against the session-less client every other function in this
 * file already uses, which is also why a person's own board still renders
 * without a session.
 *
 * Same short-circuit as the client version, for the same reason: RLS
 * (migration 021) lets an unpublished profile's row through when its owner
 * has ever posted (so the feed can still show a byline for them) — the
 * `!isPublic` check below, not the database, is what actually keeps a
 * private board off this page.
 */
export async function getPublicTierListServer(username: string): Promise<PublicTierList | null> {
  const supabase = getPublicClient();
  if (!supabase) return null;

  try {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id,username,display_name,is_public,allow_fork,donation_url")
      .eq("username", username.toLowerCase())
      .maybeSingle();

    if (!profileRow) return null;
    const row = profileRow as PublicProfileRow;
    const profile: PublicTierList["profile"] = {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      isPublic: row.is_public,
      allowFork: row.allow_fork ?? true,
      donationUrl: safeDonationUrl(row.donation_url),
    };
    if (!profile.isPublic) return null;

    const [titlesRes, channelsRes, criteriaRes] = await Promise.all([
      supabase
        .from("ranked_titles")
        .select(
          "id,tmdb_id,media_type,title,poster_path,release_date,tier,order,vote_average,added_at,updated_at"
        )
        .eq("user_id", profile.id),
      supabase
        .from("ranked_channels")
        .select("channel_id,title,thumbnail_url,country,tier,order,subscriber_count,added_at,updated_at")
        .eq("user_id", profile.id),
      supabase.from("criteria_scores").select("rating_id,criterion_id,name,score").eq("user_id", profile.id),
    ]);

    const criteriaByRating = new Map<string, CriterionScore[]>();
    for (const criterionRow of (criteriaRes.data ?? []) as PublicCriterionRow[]) {
      const list = criteriaByRating.get(criterionRow.rating_id) ?? [];
      list.push({
        criterionId: criterionRow.criterion_id,
        name: criterionRow.name,
        score: criterionRow.score,
      });
      criteriaByRating.set(criterionRow.rating_id, list);
    }

    const titles: RankedTitle[] = ((titlesRes.data ?? []) as PublicTitleRow[]).map((r) => ({
      ...(criteriaByRating.has(r.id) ? { criteriaScores: criteriaByRating.get(r.id) } : {}),
      tmdbId: r.tmdb_id,
      mediaType: r.media_type,
      title: r.title,
      posterPath: r.poster_path,
      releaseDate: r.release_date,
      tier: r.tier,
      order: r.order,
      voteAverage: r.vote_average ?? undefined,
      addedAt: r.added_at,
      updatedAt: r.updated_at,
    }));

    const channels: RankedChannel[] = ((channelsRes.data ?? []) as PublicChannelRow[]).map((r) => ({
      channelId: r.channel_id,
      title: r.title,
      thumbnailUrl: r.thumbnail_url,
      country: r.country,
      tier: r.tier,
      order: r.order,
      subscriberCount: r.subscriber_count ?? undefined,
      addedAt: r.added_at,
      updatedAt: r.updated_at,
    }));

    return { profile, titles, channels };
  } catch {
    // A page rendering as "not found" beats a 500 — the exact tradeoff the
    // client version already made by treating a thrown fetch the same as a
    // missing profile (see its own try/catch in PublicTierListView).
    return null;
  }
}

interface FeedRow {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  title: string;
  description: string;
  category: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
  is_public: boolean;
  allow_fork: boolean | null;
  donation_url: string | null;
  created_at: string;
}

/**
 * `lib/supabase/feed.ts`'s own category list, duplicated rather than
 * imported for the same reason `PublicTitleRow` above is not `getFeed`'s row
 * type: that module is `"use client"`, and only its *types* — `FeedPost`,
 * `PostCategory` — cross into server code safely.
 */
const FEED_CATEGORIES: readonly PostCategory[] = [
  "movie",
  "tv",
  "anime",
  "game",
  "youtube",
  "mixed",
  "custom",
];

function toFeedCategory(value: string): PostCategory {
  return (FEED_CATEGORIES as readonly string[]).includes(value) ? (value as PostCategory) : "mixed";
}

/** Mirrors `FEED_PAGE_SIZE` in `lib/supabase/feed.ts` — its own literal for the same client-boundary reason as `FEED_CATEGORIES` above. */
const INITIAL_FEED_LIMIT = 24;

/**
 * The feed's first page — "All" category, newest first — for the very first
 * paint of `/feed`.
 *
 * Deliberately narrow: this is `getFeed()`'s server twin for exactly one
 * call shape, not a general-purpose feed reader. Every other tab, and the
 * enrichment a visible post still needs (author titles/channels so its
 * board preview has something in it, the viewer's own likes, published
 * Custom boards, snapshots), stays on `getFeed`/`getAuthorTitles`/etc. on the
 * client, unchanged — none of that has to exist before the first paint, only
 * the posts' own titles and authors do, since that is the text a crawler
 * reading raw HTML would otherwise never see at all (`FeedView` was 100%
 * `"use client"`, fetching everything from inside `useEffect`).
 *
 * Returns `null`, not `[]`, when nothing was actually read — misconfigured
 * client or a failed query — so the caller can tell "confirmed empty feed"
 * from "could not check" and fall back to the client's own fetch instead of
 * flashing an incorrect "nothing here yet".
 */
export async function getInitialFeed(limit = INITIAL_FEED_LIMIT): Promise<FeedPost[] | null> {
  const supabase = getPublicClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("post_feed")
      .select(
        "id,user_id,username,display_name,title,description,category,views_count,likes_count,comments_count,is_public,allow_fork,donation_url,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return null;

    return (data as FeedRow[]).map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      title: row.title,
      description: row.description ?? "",
      category: toFeedCategory(row.category),
      viewsCount: row.views_count ?? 0,
      likesCount: Number(row.likes_count ?? 0),
      commentsCount: Number(row.comments_count ?? 0),
      isPublic: row.is_public,
      allowFork: row.allow_fork ?? true,
      donationUrl: safeDonationUrl(row.donation_url),
      createdAt: row.created_at,
    }));
  } catch {
    return null;
  }
}
