"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSessionSnapshot } from "@/lib/supabase/session-store";
import { safeDonationUrl } from "@/lib/utils/donation-url";
import { trackFirstPostPublished } from "@/lib/analytics/events";
import type { MediaType, RankedTitle } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";

/** The categories a post can be filed under. `mixed` is for a board of everything. */
/**
 * What a post is about. "custom" is a board of the author's own photographs,
 * which belongs to none of the catalogues and is rendered from a published
 * snapshot rather than from their ranked titles.
 *
 * The list comes first and the type is read off it, rather than the other way
 * round. Written as a union with a separate array to validate against, the two
 * drifted the day "custom" was added: the type knew about it, the array did
 * not, and since a shorter array is still a valid `PostCategory[]`, nothing
 * complained. Every custom post was quietly relabelled `mixed` on its way out
 * of the database, so the feed rendered it as a film list and said the author
 * had published nothing. Derived this way, a category cannot exist in one
 * place and not the other.
 */
export const POST_CATEGORIES = ["movie", "tv", "anime", "game", "youtube", "mixed", "custom"] as const;

export type PostCategory = (typeof POST_CATEGORIES)[number];

export interface FeedPost {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  title: string;
  description: string;
  category: PostCategory;
  viewsCount: number;
  likesCount: number;
  commentsCount: number;
  /** Whether the author's board is visible and copyable — drives the fork button. */
  isPublic: boolean;
  allowFork: boolean;
  /** The author's support link, already vetted. Null when they set none. */
  donationUrl: string | null;
  createdAt: string;
}

export interface PostComment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  displayName: string | null;
  text: string;
  createdAt: string;
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

function toCategory(value: string): PostCategory {
  return (POST_CATEGORIES as readonly string[]).includes(value) ? (value as PostCategory) : "mixed";
}

function fromRow(row: FeedRow): FeedPost {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    title: row.title,
    description: row.description ?? "",
    category: toCategory(row.category),
    viewsCount: row.views_count ?? 0,
    // The view returns bigint counts, which arrive as strings over PostgREST.
    likesCount: Number(row.likes_count ?? 0),
    commentsCount: Number(row.comments_count ?? 0),
    isPublic: row.is_public,
    allowFork: row.allow_fork ?? true,
    donationUrl: safeDonationUrl(row.donation_url),
    createdAt: row.created_at,
  };
}

function currentUserId(): string | null {
  const snapshot = getSessionSnapshot();
  return snapshot.status === "signed-in" ? snapshot.user.id : null;
}

export const FEED_PAGE_SIZE = 24;

/** Newest first. Readable by anyone — that is what makes it a feed. */
export async function getFeed(options: { category?: PostCategory; limit?: number } = {}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  let query = supabase
    .from("post_feed")
    .select(
      "id,user_id,username,display_name,title,description,category,views_count,likes_count,comments_count,is_public,allow_fork,donation_url,created_at"
    )
    .order("created_at", { ascending: false })
    .limit(options.limit ?? FEED_PAGE_SIZE);

  if (options.category) query = query.eq("category", options.category);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as FeedRow[]).map(fromRow);
}

export async function getPost(postId: string): Promise<FeedPost | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("post_feed")
    .select(
      "id,user_id,username,display_name,title,description,category,views_count,likes_count,comments_count,is_public,allow_fork,donation_url,created_at"
    )
    .eq("id", postId)
    .maybeSingle();

  if (error || !data) return null;
  return fromRow(data as FeedRow);
}

/**
 * The posters behind every visible card, in one round trip.
 *
 * A query per card would be a dozen requests for one screen. The rows come back
 * flat and are split per author by `titlesByAuthor`.
 */
export async function getAuthorTitles(
  userIds: string[],
  perAuthorCap = 40
): Promise<(RankedTitle & { userId: string })[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || userIds.length === 0) return [];

  const { data, error } = await supabase
    .from("ranked_titles")
    .select("user_id,tmdb_id,media_type,title,poster_path,release_date,tier,order,added_at,updated_at")
    .in("user_id", userIds)
    // Ordered, not merely capped: without this a title's absence from this
    // batch was harmless — the live preview was already a cap, one title more
    // or less went unnoticed. A published snapshot changes what "missing"
    // means. It now reads as "the author took this down", the same as a
    // vanished custom card — and an author with more than `perAuthorCap`
    // titles would see that happen to whichever ones the database felt like
    // returning that call, for a board they never touched. `id` is the
    // primary key, so this costs nothing new and needs no extra index.
    .order("id", { ascending: true })
    .limit(userIds.length * perAuthorCap);

  if (error || !data) return [];

  return (
    data as {
      user_id: string;
      tmdb_id: number;
      media_type: string;
      title: string;
      poster_path: string | null;
      release_date: string | null;
      tier: string;
      order: number;
      added_at: number;
      updated_at: number;
    }[]
  ).map((row) => ({
    userId: row.user_id,
    tmdbId: row.tmdb_id,
    mediaType: row.media_type as MediaType,
    title: row.title,
    posterPath: row.poster_path,
    releaseDate: row.release_date,
    tier: row.tier as RankedTitle["tier"],
    order: row.order,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * The avatars behind every visible card's YouTube channels, in one round trip.
 *
 * Mirrors `getAuthorTitles` exactly, `ranked_channels` in place of
 * `ranked_titles` — same reason for ordering by `id` before the cap: an author
 * past `perAuthorCap` channels must lose the same ones every call, or a
 * published snapshot reads an arbitrary absence as a takedown.
 */
export async function getAuthorChannels(
  userIds: string[],
  perAuthorCap = 40
): Promise<(RankedChannel & { userId: string })[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || userIds.length === 0) return [];

  const { data, error } = await supabase
    .from("ranked_channels")
    .select("user_id,channel_id,title,thumbnail_url,country,tier,order,subscriber_count,added_at,updated_at")
    .in("user_id", userIds)
    .order("id", { ascending: true })
    .limit(userIds.length * perAuthorCap);

  if (error || !data) return [];

  return (
    data as {
      user_id: string;
      channel_id: string;
      title: string;
      thumbnail_url: string | null;
      country: string | null;
      tier: string;
      order: number;
      subscriber_count: number | null;
      added_at: number;
      updated_at: number;
    }[]
  ).map((row) => ({
    userId: row.user_id,
    channelId: row.channel_id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    country: row.country,
    tier: row.tier as RankedChannel["tier"],
    order: row.order,
    subscriberCount: row.subscriber_count ?? undefined,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  }));
}

export type PublishResult =
  | { ok: true; postId: string }
  | { ok: false; error: string };

/** One title's place on the board, as it stood the moment Publish was pressed. */
export interface RankedTitleSnapshotEntry {
  tmdbId: number;
  mediaType: MediaType;
  tier: RankedTitle["tier"];
  order: number;
}

/** One channel's place on the board, as it stood the moment Publish was pressed. */
export interface RankedChannelSnapshotEntry {
  channelId: string;
  tier: RankedChannel["tier"];
  order: number;
}

export interface PostSnapshot {
  titles: RankedTitleSnapshotEntry[];
  channels: RankedChannelSnapshotEntry[];
}

function buildSnapshot(titles: RankedTitle[], channels: RankedChannel[]): PostSnapshot {
  return {
    titles: titles.map((t) => ({
      tmdbId: t.tmdbId,
      mediaType: t.mediaType,
      tier: t.tier,
      order: t.order,
    })),
    channels: channels.map((c) => ({
      channelId: c.channelId,
      tier: c.tier,
      order: c.order,
    })),
  };
}

/**
 * Whether this account has never had a post before this moment.
 *
 * Asked of the database immediately before the write that might change the
 * answer, the same way `first_title_ranked` asks the local store before
 * adding — publishing is rare enough that one extra read costs nothing, and
 * it is the only way to get "first ever" right across a second device or a
 * cleared cache. Shared between `publishPost` and `publishCustomBoard`: both
 * write into the same `posts` table, so whichever kind of board an account
 * publishes first is the one the funnel should credit.
 */
export async function isFirstPostForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase.from("posts").select("id").eq("user_id", userId).limit(1);
  return (data?.length ?? 0) === 0;
}

export async function publishPost(input: {
  title: string;
  description: string;
  category: PostCategory;
  /** The board as it stands right now — frozen into the post, not re-read later. */
  titles: RankedTitle[];
  /** Same freezing, for the other store a board can be made of. */
  channels?: RankedChannel[];
  /** The dialog's checkbox — kept true only by the time Publish can be clicked. */
  rulesConfirmed: boolean;
}): Promise<PublishResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "Cloud accounts are not configured." };

  const userId = currentUserId();
  if (!userId) return { ok: false, error: "Sign in to publish posts." };

  // Checked again here for the same reason publishCustomBoard checks it again:
  // the dialog's own checkbox already keeps this true by the time this can be
  // reached through it, so this is for whatever reaches the function by a
  // path other than that button.
  if (!input.rulesConfirmed) {
    return { ok: false, error: "Confirm the post follows the site's content rules before publishing." };
  }

  // Same rule as publishCustomBoard, checked again here for the same reason:
  // the caller already filters `titles`/`channels` down to the chosen
  // category before this runs, and a category with nothing ranked in it — or
  // a whole board with nothing ranked at all — would otherwise publish as a
  // post with nothing to show.
  if ((input.titles?.length ?? 0) === 0 && (input.channels?.length ?? 0) === 0) {
    return { ok: false, error: "Rank at least one title before publishing." };
  }

  const isFirstPost = await isFirstPostForUser(supabase, userId);

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: userId,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
    })
    .select("id")
    .single();

  if (error || !data) {
    // The foreign key points at `profiles`, so the usual failure is a user who
    // never claimed a handle — worth saying plainly rather than "unknown error".
    return {
      ok: false,
      error: error?.code === "23503"
        ? "Claim a username in settings first — posts are signed with it."
        : "Could not publish the post. Please try again.",
    };
  }

  const postId = (data as { id: string }).id;

  const { error: snapshotError } = await supabase
    .from("ranked_title_publications")
    .insert({ post_id: postId, snapshot: buildSnapshot(input.titles, input.channels ?? []) });

  if (snapshotError) {
    // A post with no snapshot would render from a live read forever, quietly
    // rewriting itself every time the board changes — exactly the bug this
    // exists to close. Withdrawn rather than left half-made, the same
    // rollback publishCustomBoard already uses for the same reason.
    await supabase.from("posts").delete().eq("id", postId);
    console.error("TierListOnline: the snapshot failed, so the post was withdrawn —", snapshotError);
    return { ok: false, error: "Could not publish the post. Please try again." };
  }

  if (isFirstPost) trackFirstPostPublished("tier_list");
  return { ok: true, postId };
}

/**
 * The frozen shape behind each of these posts, keyed by post id.
 *
 * A post with no entry here is one published before this existed — the
 * caller's job is to fall back to a live read for it, not to treat a missing
 * key as an error. `channels` is missing the same way on a post published
 * before it existed here — a post that has always been title-only gets `[]`,
 * not a crash.
 */
export async function getPostSnapshots(postIds: string[]): Promise<Map<string, PostSnapshot>> {
  const snapshots = new Map<string, PostSnapshot>();
  const supabase = getSupabaseBrowserClient();
  if (!supabase || postIds.length === 0) return snapshots;

  const { data, error } = await supabase
    .from("ranked_title_publications")
    .select("post_id, snapshot")
    .in("post_id", postIds);
  if (error || !data) return snapshots;

  for (const row of data as {
    post_id: string;
    snapshot: { titles?: RankedTitleSnapshotEntry[]; channels?: RankedChannelSnapshotEntry[] };
  }[]) {
    snapshots.set(row.post_id, {
      titles: row.snapshot.titles ?? [],
      channels: row.snapshot.channels ?? [],
    });
  }
  return snapshots;
}

/** Which of these posts the signed-in visitor has already liked. */
export async function getMyLikes(postIds: string[]): Promise<Set<string>> {
  const supabase = getSupabaseBrowserClient();
  const userId = currentUserId();
  if (!supabase || !userId || postIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);

  if (error || !data) return new Set();
  return new Set((data as { post_id: string }[]).map((row) => row.post_id));
}

/**
 * Adds or removes the visitor's like. Returns the new state, or null if the
 * write did not land — the caller rolls its optimistic update back on null.
 */
export async function toggleLike(postId: string, liked: boolean): Promise<boolean | null> {
  const supabase = getSupabaseBrowserClient();
  const userId = currentUserId();
  if (!supabase || !userId) return null;

  if (liked) {
    const { error } = await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    return error ? null : false;
  }

  const { error } = await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
  // A duplicate means the like already existed — the end state is what was
  // wanted, so it is a success, not a failure.
  if (error && error.code !== "23505") return null;
  return true;
}

export async function getComments(postId: string): Promise<PostComment[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("post_comments")
    .select("id,post_id,user_id,text,created_at,profiles(username,display_name)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return (
    data as {
      id: string;
      post_id: string;
      user_id: string;
      text: string;
      created_at: string;
      profiles: { username: string; display_name: string | null } | null;
    }[]
  ).map((row) => ({
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    username: row.profiles?.username ?? "anonymous",
    displayName: row.profiles?.display_name ?? null,
    text: row.text,
    createdAt: row.created_at,
  }));
}

export async function addComment(postId: string, text: string): Promise<PostComment | null> {
  const supabase = getSupabaseBrowserClient();
  const userId = currentUserId();
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from("post_comments")
    .insert({ post_id: postId, user_id: userId, text: text.trim() })
    .select("id,post_id,user_id,text,created_at,profiles(username,display_name)")
    .single();

  if (error || !data) return null;

  const row = data as {
    id: string;
    post_id: string;
    user_id: string;
    text: string;
    created_at: string;
    profiles: { username: string; display_name: string | null } | null;
  };
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    username: row.profiles?.username ?? "anonymous",
    displayName: row.profiles?.display_name ?? null,
    text: row.text,
    createdAt: row.created_at,
  };
}

/**
 * Bumps the view counter through the SECURITY DEFINER function from migration
 * 009 — the table itself is not writable by visitors, deliberately.
 */
export async function registerPostView(postId: string): Promise<void> {
  /*
   * Through the app's own route rather than straight at the RPC.
   *
   * The database cannot see who is asking — PostgREST is the client as far as
   * it is concerned — so an anonymous reader had no identity to de-duplicate
   * on, and the counter moved once per call for anybody who cared to call it.
   * The route can see the address and turns it into an opaque handle, which is
   * what lets one anonymous reader be told apart from another without either
   * being recorded. See migration 018.
   *
   * Failure is swallowed: a view that did not count is not worth interrupting
   * somebody's reading for, which is the behaviour this already had.
   */
  try {
    await fetch("/api/post-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId }),
      keepalive: true,
    });
  } catch {
    // Offline, or the reader navigated away mid-flight.
  }
}

/**
 * Takes a post back out of the feed.
 *
 * Publishing was one-way until now: an author could make the board private,
 * which emptied the pictures out of their post, but the post itself stayed in
 * the feed under its title with nothing behind it and no way to remove it.
 * For a board of somebody's own photographs that is the wrong default — the
 * person who put it there should be able to take it back.
 *
 * The database has allowed this since the feed was built (`for delete using
 * (auth.uid() = user_id)`); what was missing was anywhere to ask. Any
 * publication attached to the post goes with it, by the foreign key.
 */
export async function deletePost(postId: string): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) {
    console.error("TierListOnline: deleting a post failed —", error);
    return false;
  }
  return true;
}
