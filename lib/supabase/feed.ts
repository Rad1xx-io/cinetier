"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSessionSnapshot } from "@/lib/supabase/session-store";
import { safeDonationUrl } from "@/lib/utils/donation-url";
import type { MediaType, RankedTitle } from "@/lib/types";

/** The categories a post can be filed under. `mixed` is for a board of everything. */
export type PostCategory = MediaType | "youtube" | "mixed";

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

const CATEGORIES: PostCategory[] = ["movie", "tv", "anime", "game", "youtube", "mixed"];

function toCategory(value: string): PostCategory {
  return (CATEGORIES as string[]).includes(value) ? (value as PostCategory) : "mixed";
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

export type PublishResult =
  | { ok: true; postId: string }
  | { ok: false; error: string };

export async function publishPost(input: {
  title: string;
  description: string;
  category: PostCategory;
}): Promise<PublishResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "Cloud accounts are not configured." };

  const userId = currentUserId();
  if (!userId) return { ok: false, error: "Sign in to publish posts." };

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
  return { ok: true, postId: (data as { id: string }).id };
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
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  await supabase.rpc("increment_post_views", { p_post_id: postId });
}
