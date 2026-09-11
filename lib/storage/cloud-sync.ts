"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";
import type { GameSource } from "@/lib/types/game";
import type { AnimeCatalogSource } from "@/lib/types/anime";
import type { PullOutcome } from "@/lib/storage/sync-decision";

/**
 * `ranked_titles.source` is `not null` (migration 031, extended for anime by
 * 032) so that the unique constraint keeps deduplicating movie/tv rows —
 * Postgres treats every `null` in a unique index as distinct from every other
 * `null`, so a nullable `source` would have silently stopped deduplicating
 * the two media types that were never ambiguous the moment it was added.
 * `'native'` for those; `'unknown'` for a game or anime whose source
 * genuinely isn't known (never recorded, or ranked before this column
 * existed) rather than guessed at.
 */
export type RankedTitleSourceColumn = "native" | "steam" | "igdb" | "anilist" | "jikan" | "unknown";

export function toSourceColumn(
  mediaType: MediaType,
  gameSource: GameSource | undefined,
  animeSource?: AnimeCatalogSource
): RankedTitleSourceColumn {
  if (mediaType === "game") return gameSource ?? "unknown";
  if (mediaType === "anime") return animeSource ?? "unknown";
  return "native";
}

/** The inverse of `toSourceColumn` — 'native' and 'unknown' both mean "not a known catalogue source". */
function fromSourceColumn(source: RankedTitleSourceColumn): {
  gameSource?: GameSource;
  animeSource?: AnimeCatalogSource;
} {
  if (source === "steam" || source === "igdb") return { gameSource: source };
  if (source === "anilist" || source === "jikan") return { animeSource: source };
  return {};
}

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
  source: RankedTitleSourceColumn;
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
    source: toSourceColumn(t.mediaType, t.gameSource, t.animeSource),
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
  const { gameSource, animeSource } = fromSourceColumn(row.source);
  return {
    tmdbId: row.tmdb_id,
    mediaType: row.media_type,
    ...(gameSource ? { gameSource } : {}),
    ...(animeSource ? { animeSource } : {}),
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
    .select("tmdb_id,media_type,source,title,poster_path,release_date,tier,order,vote_average,added_at,updated_at")
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
      .upsert(rows, { onConflict: "user_id,tmdb_id,media_type,source" });
    if (error) {
      console.error("TierListOnline: failed to push rankings to cloud", error);
      return;
    }
  }

  const { data: existing, error: fetchError } = await supabase
    .from("ranked_titles")
    .select("tmdb_id,media_type,source")
    .eq("user_id", userId);

  if (fetchError || !existing) return;

  // `source` is part of the key here for the same reason it is part of the
  // upsert conflict target above: a Steam-sourced and an IGDB-sourced game
  // (or an AniList-sourced and a Jikan-sourced anime) can now share a
  // tmdb_id, and without `source` in this comparison one would read as
  // "stale" and be deleted out from under the other the moment they
  // happened to collide.
  const localKeys = new Set(
    titles.map(
      (t) => `${t.mediaType}:${t.tmdbId}:${toSourceColumn(t.mediaType, t.gameSource, t.animeSource)}`
    )
  );
  const staleRows = (existing as Pick<RankedTitleRow, "tmdb_id" | "media_type" | "source">[]).filter(
    (row) => !localKeys.has(`${row.media_type}:${row.tmdb_id}:${row.source}`)
  );

  /*
   * Removed in batches, not one request per row.
   *
   * This used to `await` a separate DELETE for every stale row, which is
   * invisible on the boards these paths were written against and linear on a
   * real one: a board of two hundred titles replaced by another meant two
   * hundred sequential round trips, each waiting for the last, with the sync
   * held open for all of them. The rows are grouped by (media type, source) —
   * source joined the group for the same reason it joined the key above, so a
   * batch can never mix a stale Steam row into the same `in (...)` list as a
   * still-current IGDB one sharing the same tmdb_id — and chunked so the `in`
   * list cannot grow into a URL no server will accept.
   */
  const byMediaTypeAndSource = new Map<string, { mediaType: MediaType; source: RankedTitleSourceColumn; ids: number[] }>();
  for (const row of staleRows) {
    const groupKey = `${row.media_type}:${row.source}`;
    const group = byMediaTypeAndSource.get(groupKey) ?? {
      mediaType: row.media_type,
      source: row.source,
      ids: [],
    };
    group.ids.push(row.tmdb_id);
    byMediaTypeAndSource.set(groupKey, group);
  }

  for (const { mediaType, source, ids } of byMediaTypeAndSource.values()) {
    for (let from = 0; from < ids.length; from += DELETE_CHUNK_SIZE) {
      const { error: deleteError } = await supabase
        .from("ranked_titles")
        .delete()
        .eq("user_id", userId)
        .eq("media_type", mediaType)
        .eq("source", source)
        .in("tmdb_id", ids.slice(from, from + DELETE_CHUNK_SIZE));

      if (deleteError) {
        console.error("TierListOnline: failed to remove stale cloud rankings", deleteError);
        return;
      }
    }
  }
}
