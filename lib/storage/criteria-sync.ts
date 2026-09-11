"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MediaType } from "@/lib/types";
import type { GameSource } from "@/lib/types/game";
import type { AnimeCatalogSource } from "@/lib/types/anime";
import type { CriterionScore } from "@/lib/types/criteria";
import { toSourceColumn } from "@/lib/storage/cloud-sync";

interface CriteriaRow {
  criterion_id: string;
  name: string;
  score: number;
}

/**
 * Resolves the ranked_titles row a breakdown hangs off.
 *
 * The local record has no database id — cloud-sync upserts on the natural key
 * (user, tmdb id, media type) and never reads ids back — so the id is looked up
 * here rather than carried around in localStorage, where it would only ever be
 * one failed sync away from being wrong.
 */
async function findRatingId(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  gameSource: GameSource | undefined,
  animeSource: AnimeCatalogSource | undefined
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  // `source` narrows this to one row same as everywhere else `tmdb_id` alone
  // stopped being enough to name a game or anime (see RankedTitle.gameSource,
  // RankedTitle.animeSource) — without it, two entries sharing a number would
  // make `.maybeSingle()` below throw instead of finding either one's
  // breakdown.
  const { data } = await supabase
    .from("ranked_titles")
    .select("id")
    .eq("user_id", userId)
    .eq("tmdb_id", tmdbId)
    .eq("media_type", mediaType)
    .eq("source", toSourceColumn(mediaType, gameSource, animeSource))
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Mirrors one title's breakdown to the cloud.
 *
 * Criteria the user removed are deleted rather than left behind: without that
 * pass a dropped criterion would keep reappearing on the next device to pull.
 */
export async function pushCriteria(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  scores: CriterionScore[],
  gameSource?: GameSource,
  animeSource?: AnimeCatalogSource
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  const ratingId = await findRatingId(userId, tmdbId, mediaType, gameSource, animeSource);
  // The rating itself has not reached the cloud yet; the next sync will carry
  // the breakdown along with it rather than orphaning it here.
  if (!ratingId) return;

  if (scores.length > 0) {
    const rows = scores.map((s) => ({
      rating_id: ratingId,
      user_id: userId,
      criterion_id: s.criterionId,
      name: s.name,
      score: s.score,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("criteria_scores")
      .upsert(rows, { onConflict: "rating_id,criterion_id" });

    if (error) {
      console.error("TierListOnline: failed to push criteria", error);
      return;
    }
  }

  const keptIds = scores.map((s) => s.criterionId);
  const removal = supabase.from("criteria_scores").delete().eq("rating_id", ratingId);
  const { error: deleteError } = keptIds.length
    ? await removal.not("criterion_id", "in", `(${keptIds.map((id) => `"${id}"`).join(",")})`)
    : await removal;

  if (deleteError) console.error("TierListOnline: failed to prune criteria", deleteError);
}

/** Reads one title's breakdown back down. Empty array when there is none. */
export async function pullCriteria(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  gameSource?: GameSource,
  animeSource?: AnimeCatalogSource
): Promise<CriterionScore[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const ratingId = await findRatingId(userId, tmdbId, mediaType, gameSource, animeSource);
  if (!ratingId) return [];

  const { data, error } = await supabase
    .from("criteria_scores")
    .select("criterion_id,name,score")
    .eq("rating_id", ratingId);

  if (error || !data) return [];

  return (data as CriteriaRow[]).map((r) => ({
    criterionId: r.criterion_id,
    name: r.name,
    score: r.score,
  }));
}
