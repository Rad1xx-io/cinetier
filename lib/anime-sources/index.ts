import "server-only";
import { anilistSource } from "@/lib/anime-sources/anilist-source";
import { jikanSource } from "@/lib/anime-sources/jikan-source";
import type { AnimeSource, AnimeSourceId } from "@/lib/anime-sources/anime-source";

export { AnimeSourceError } from "@/lib/anime-sources/anime-source";
export type { AnimeQuery, AnimeSource, AnimeSourceId } from "@/lib/anime-sources/anime-source";

const SOURCES: Record<AnimeSourceId, AnimeSource> = {
  anilist: anilistSource,
  jikan: jikanSource,
};

/**
 * Which catalogue is live.
 *
 * MyAnimeList, because AniList disabled its API — "temporarily disabled due to
 * severe stability issues" is what the endpoint returns — and the anime tab
 * went with it. Overridable by env so the switch back needs a redeploy rather
 * than a release, and so a preview can be pointed at the other source to check
 * it before flipping production.
 */
const DEFAULT_SOURCE: AnimeSourceId = "jikan";

function isSourceId(value: string | undefined): value is AnimeSourceId {
  return value === "anilist" || value === "jikan";
}

export function activeAnimeSourceId(): AnimeSourceId {
  const configured = process.env.ANIME_SOURCE?.trim().toLowerCase();
  return isSourceId(configured) ? configured : DEFAULT_SOURCE;
}

/**
 * The source the API routes read through.
 *
 * ---------------------------------------------------------------------------
 * A WARNING FOR WHOEVER ADDS THE SETTINGS TOGGLE
 *
 * `AnimeSummary.anilistId` is not a source-neutral identifier. It is written
 * into every user's board as `RankedTitle.tmdbId` and mirrored to Supabase, so
 * it already exists in stored data — and AniList ids and MyAnimeList ids are
 * two different numbering schemes.
 *
 * They agree more often than you would expect, because AniList seeded its
 * catalogue from MyAnimeList: 1 is Cowboy Bebop in both, 5114 is Fullmetal
 * Alchemist: Brotherhood in both, 16498 is Attack on Titan in both (all three
 * verified against the live Jikan API). Titles added after that import have no
 * such guarantee, and there the same number means two different shows.
 *
 * So a per-user toggle cannot be a simple swap. Boards saved under one source
 * would silently repoint under the other. Before shipping one, `RankedTitle`
 * needs to record which catalogue an entry came from, and the id needs to be
 * resolved through that — AniList exposes `idMal` for exactly this mapping.
 * ---------------------------------------------------------------------------
 */
export function getAnimeSource(id: AnimeSourceId = activeAnimeSourceId()): AnimeSource {
  return SOURCES[id];
}
