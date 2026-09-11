import type { MediaType, Tier } from "@/lib/types";
import type { GameSource } from "@/lib/types/game";
import type { AnimeCatalogSource } from "@/lib/types/anime";

/** Titles only — see migration 033's header for why custom boards and channels are both out of v1. */
export type VotingCategory = "movie" | "tv" | "anime" | "game" | "mixed";

/**
 * One title in a session's frozen pool.
 *
 * `itemKey` is the identity `battleItemId` already builds for a `RankedTitle`
 * — reused, not reinvented, so the Steam/IGDB and AniList/MyAnimeList
 * collisions migrations 031/032 closed cannot reopen quietly inside a third
 * table. `posterPath` is resolved to an absolute url at session-creation
 * time (mirrors `battles.items`, migration 006): the session outlives the
 * board it was built from, and a relative TMDB path only means something in
 * combination with a size this feature does not otherwise carry.
 */
export interface VotingPoolItem {
  itemKey: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  gameSource?: GameSource;
  animeSource?: AnimeCatalogSource;
}

export interface VotingSession {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  category: VotingCategory;
  pool: VotingPoolItem[];
  closedAt: string | null;
  resultPostId: string | null;
  createdAt: string;
}

/** One browser's own ballot: a tier for as many pool items as it chose to rate. Partial is allowed. */
export type VotingRatings = Record<string, Tier>;

export type SubmitBallotResult =
  | { ok: true }
  | { ok: false; reason: "already-voted" | "closed" | "not-configured" | "unknown" };

export type CloseSessionResult =
  | { ok: true; postId: string }
  | { ok: false; reason: "not-creator" | "already-closed" | "not-configured" | "unknown" };
