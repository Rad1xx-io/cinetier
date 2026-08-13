"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";

interface RankedTitleRow {
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

function toRow(userId: string, t: RankedTitle): RankedTitleRow & { user_id: string } {
  return {
    user_id: userId,
    tmdb_id: t.tmdbId,
    media_type: t.mediaType,
    title: t.title,
    poster_path: t.posterPath,
    release_date: t.releaseDate,
    tier: t.tier,
    order: t.order,
    vote_average: t.voteAverage ?? null,
    added_at: t.addedAt,
    updated_at: t.updatedAt,
  };
}

function fromRow(row: RankedTitleRow): RankedTitle {
  return {
    tmdbId: row.tmdb_id,
    mediaType: row.media_type,
    title: row.title,
    posterPath: row.poster_path,
    releaseDate: row.release_date,
    tier: row.tier,
    order: row.order,
    voteAverage: row.vote_average ?? undefined,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}

/** Fetches everything this user has stored in the cloud. Empty array if not configured or on error. */
export async function pullCloudTitles(userId: string): Promise<RankedTitle[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("ranked_titles")
    .select("tmdb_id,media_type,title,poster_path,release_date,tier,order,vote_average,added_at,updated_at")
    .eq("user_id", userId);

  if (error || !data) {
    console.error("CineTier: failed to pull cloud rankings", error);
    return [];
  }

  return data.map(fromRow);
}

/**
 * Mirrors the full local ranking list to the cloud: upserts everything
 * currently local, then removes any cloud rows for titles no longer present
 * locally (covers single removals and "clear all").
 */
export async function pushCloudTitles(userId: string, titles: RankedTitle[]): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  if (titles.length > 0) {
    const rows = titles.map((t) => toRow(userId, t));
    const { error } = await supabase
      .from("ranked_titles")
      .upsert(rows, { onConflict: "user_id,tmdb_id,media_type" });
    if (error) {
      console.error("CineTier: failed to push rankings to cloud", error);
      return;
    }
  }

  const { data: existing, error: fetchError } = await supabase
    .from("ranked_titles")
    .select("tmdb_id,media_type")
    .eq("user_id", userId);

  if (fetchError || !existing) return;

  const localKeys = new Set(titles.map((t) => `${t.mediaType}:${t.tmdbId}`));
  const staleRows = (existing as Pick<RankedTitleRow, "tmdb_id" | "media_type">[]).filter(
    (row) => !localKeys.has(`${row.media_type}:${row.tmdb_id}`)
  );

  for (const row of staleRows) {
    await supabase
      .from("ranked_titles")
      .delete()
      .eq("user_id", userId)
      .eq("tmdb_id", row.tmdb_id)
      .eq("media_type", row.media_type);
  }
}
