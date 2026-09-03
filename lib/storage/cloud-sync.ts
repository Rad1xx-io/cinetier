"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";
import type { PullOutcome } from "@/lib/storage/sync-decision";

/**
 * How many ids travel in one `in (…)` filter. PostgREST carries them in the
 * query string, so this is a ceiling on URL length rather than on the server's
 * appetite — large enough that an ordinary board is one request, small enough
 * that an extraordinary one is still a handful.
 */
const DELETE_CHUNK_SIZE = 100;

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

/**
 * Fetches everything this user has stored in the cloud.
 *
 * Reports a failure rather than an empty list. The two used to be the same
 * answer here, which let a dropped request stand in for "new account with
 * nothing saved" — and that is the branch that pushes the local board up.
 */
export async function pullCloudTitles(userId: string): Promise<PullOutcome<RankedTitle>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { status: "failed", reason: "cloud accounts are not configured" };

  const { data, error } = await supabase
    .from("ranked_titles")
    .select("tmdb_id,media_type,title,poster_path,release_date,tier,order,vote_average,added_at,updated_at")
    .eq("user_id", userId);

  if (error || !data) {
    console.error("TierListOnline: failed to pull cloud rankings", error);
    return { status: "failed", reason: error?.message ?? "no data returned" };
  }

  return { status: "ok", items: data.map(fromRow) };
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
      console.error("TierListOnline: failed to push rankings to cloud", error);
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

  /*
   * Removed in batches, not one request per row.
   *
   * This used to `await` a separate DELETE for every stale row, which is
   * invisible on the boards these paths were written against and linear on a
   * real one: a board of two hundred titles replaced by another meant two
   * hundred sequential round trips, each waiting for the last, with the sync
   * held open for all of them. The rows are grouped by media type so the
   * composite key still matches exactly what the row-at-a-time version
   * matched — the same rows, in at most a handful of requests instead of one
   * each — and chunked so the `in` list cannot grow into a URL no server will
   * accept.
   */
  const byMediaType = new Map<MediaType, number[]>();
  for (const row of staleRows) {
    const ids = byMediaType.get(row.media_type) ?? [];
    ids.push(row.tmdb_id);
    byMediaType.set(row.media_type, ids);
  }

  for (const [mediaType, ids] of byMediaType) {
    for (let from = 0; from < ids.length; from += DELETE_CHUNK_SIZE) {
      const { error: deleteError } = await supabase
        .from("ranked_titles")
        .delete()
        .eq("user_id", userId)
        .eq("media_type", mediaType)
        .in("tmdb_id", ids.slice(from, from + DELETE_CHUNK_SIZE));

      if (deleteError) {
        console.error("TierListOnline: failed to remove stale cloud rankings", deleteError);
        return;
      }
    }
  }
}
