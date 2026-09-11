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
 * AniList. It was down for a stretch — "temporarily disabled due to severe
 * stability issues" was what every endpoint returned, and the anime tab went
 * with it — which is why the Jikan implementation exists at all. AniList has
 * since recovered and answers search, details and genres; Jikan's own list
 * endpoints were still failing when this was written, so it is the standby
 * rather than the default.
 *
 * This deliberately matches what production already sets in ANIME_SOURCE. The
 * two agreeing means losing the variable degrades nothing, where before it
 * would have silently swapped in a source whose search does not work.
 *
 * Still overridable by env, so switching costs a redeploy rather than a release
 * and a preview can be pointed at the other source before production is.
 */
const DEFAULT_SOURCE: AnimeSourceId = "anilist";

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
 * `AnimeSummary.anilistId` is still not a source-neutral identifier — AniList
 * ids and MyAnimeList ids are two different numbering schemes. They agree
 * more often than you would expect, because AniList seeded its catalogue
 * from MyAnimeList: 1 is Cowboy Bebop in both, 5114 is Fullmetal Alchemist:
 * Brotherhood in both, 16498 is Attack on Titan in both (all three verified
 * against the live Jikan API). Titles added after that import have no such
 * guarantee, and there the same number means two different shows.
 *
 * The prerequisite this warning used to name — `RankedTitle` recording which
 * catalogue an entry came from — is done: `AnimeSummary.catalogSource` and
 * `RankedTitle.animeSource` (migration 032, 2026-09-10) mean a new entry from
 * either catalogue can no longer collide with one from the other, in storage,
 * in cloud sync, in a battle, or on a widget. What that does NOT yet give you
 * is a safe live toggle: `/anime/[id]` (`app/anime/[id]/page.tsx`) still
 * resolves purely through `getAnimeSource().getDetails(id)` — the *active*
 * source only, no fallback to the other the way `getGameDetails` (`lib/games/
 * source.ts`) tries IGDB then Steam. Flip `ANIME_SOURCE` today and an id
 * saved under the source you just left behind either 404s or, on a
 * pre-032 board sharing a number across catalogues, resolves as the wrong
 * anime with no signal that anything went wrong. Before a toggle ships, that
 * route needs the same double-lookup games already has — and AniList's own
 * `idMal` field is still the tool for mapping one id to the other, unchanged
 * from what this comment said before.
 * ---------------------------------------------------------------------------
 */
export function getAnimeSource(id: AnimeSourceId = activeAnimeSourceId()): AnimeSource {
  return SOURCES[id];
}
