import type {
  AnimeDetails,
  AnimeRelation,
  AnimeSeason,
  AnimeStatus,
  AnimeSummary,
} from "@/lib/types/anime";
import type { JikanAnime, JikanNamedEntity } from "@/lib/anime-sources/jikan-types";

/**
 * MyAnimeList closes most synopses with a credit line. It is metadata about
 * the text rather than part of it, and it reads as noise in a card.
 */
const SYNOPSIS_CREDIT = /\s*\[Written by MAL Rewrite\]\s*$/i;

export function cleanSynopsis(value: string | null | undefined): string {
  return (value ?? "").replace(SYNOPSIS_CREDIT, "").trim();
}

/**
 * Jikan reports duration as prose — "24 min per ep", "1 hr 59 min", "Unknown" —
 * where AniList gave a number of minutes. Both shapes appear across the
 * catalogue, so hours and minutes are summed rather than matched one or other.
 */
export function parseDurationMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const hours = /(\d+)\s*hr/i.exec(value);
  const minutes = /(\d+)\s*min/i.exec(value);
  if (!hours && !minutes) return null;
  const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  return total > 0 ? total : null;
}

const STATUS_MAP: Record<string, AnimeStatus> = {
  "finished airing": "FINISHED",
  "currently airing": "RELEASING",
  "not yet aired": "NOT_YET_RELEASED",
};

/**
 * MyAnimeList has no state for a cancelled or paused production, so those two
 * members of AnimeStatus simply never arrive from this source. Anything
 * unrecognised becomes null rather than a guess.
 */
export function mapStatus(value: string | null | undefined): AnimeStatus | null {
  return STATUS_MAP[(value ?? "").trim().toLowerCase()] ?? null;
}

const SEASONS: AnimeSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

export function mapSeason(value: string | null | undefined): AnimeSeason | null {
  const upper = (value ?? "").trim().toUpperCase();
  return SEASONS.includes(upper as AnimeSeason) ? (upper as AnimeSeason) : null;
}

/** "Movie" → "MOVIE", to match the vocabulary the format filter already uses. */
export function mapFormat(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function names(entries: JikanNamedEntity[] | undefined): string[] {
  return (entries ?? []).map((entry) => entry.name).filter(Boolean);
}

function coverOf(raw: JikanAnime): string | null {
  const jpg = raw.images?.jpg;
  return jpg?.large_image_url ?? jpg?.image_url ?? jpg?.small_image_url ?? null;
}

/**
 * The headline, in the order a reader wants it.
 *
 * AniList could offer a Russian name from its community synonyms; MyAnimeList's
 * `titles` array carries localisations for several languages but not Russian —
 * checked against the live catalogue — so English leads here and the romaji
 * default backs it up.
 */
function pickTitle(raw: JikanAnime): string {
  return raw.title_english?.trim() || raw.title?.trim() || raw.title_japanese?.trim() || "Untitled";
}

/**
 * Genres, themes and demographics are three separate lists on MyAnimeList where
 * AniList had one. They are merged: "Shounen" and "Isekai" live under themes
 * and demographics there, and a reader who filters by genre expects to find
 * them. Duplicates are dropped, order preserved.
 */
export function mergedGenres(raw: JikanAnime): string[] {
  const all = [...names(raw.genres), ...names(raw.themes), ...names(raw.demographics)];
  return [...new Set(all)];
}

export function mapJikanToSummary(raw: JikanAnime): AnimeSummary {
  return {
    // Deliberately a MAL id in a field named for AniList — see the note in
    // lib/anime-sources/index.ts. Renaming it would rewrite every stored board.
    anilistId: raw.mal_id,
    title: pickTitle(raw),
    titles: {
      romaji: raw.title ?? null,
      english: raw.title_english ?? null,
      native: raw.title_japanese ?? null,
    },
    coverImage: coverOf(raw),
    // MyAnimeList publishes no wide artwork; the details header falls back to
    // the cover, which is why this may be null without anything breaking.
    bannerImage: null,
    description: cleanSynopsis(raw.synopsis),
    year: raw.year ?? raw.aired?.prop?.from?.year ?? null,
    season: mapSeason(raw.season),
    episodes: raw.episodes ?? null,
    duration: parseDurationMinutes(raw.duration),
    status: mapStatus(raw.status),
    genres: mergedGenres(raw),
    // Already 0-10 here. AniList's 0-100 was divided; dividing again would put
    // every anime under 1.
    score: typeof raw.score === "number" ? raw.score : null,
    favourites: raw.favorites ?? null,
    studios: names(raw.studios),
    format: mapFormat(raw.type),
  };
}

/**
 * Relations come grouped by kind, and each entry carries only an id, a name and
 * a type — no artwork. The cards fall back to their titled placeholder, which
 * is why `coverImage` is null rather than absent.
 */
export function mapRelations(raw: JikanAnime): AnimeRelation[] {
  const out: AnimeRelation[] = [];
  for (const group of raw.relations ?? []) {
    for (const entry of group.entry ?? []) {
      // Manga, novels and the rest link to pages this app does not have.
      if (entry.type?.toLowerCase() !== "anime") continue;
      out.push({
        anilistId: entry.mal_id,
        title: entry.name ?? "Untitled",
        relationType: group.relation ?? "Related",
        coverImage: null,
        format: null,
      });
    }
  }
  return out;
}

export function mapJikanToDetails(raw: JikanAnime): AnimeDetails {
  return {
    ...mapJikanToSummary(raw),
    ...(typeof raw.scored_by === "number" && raw.scored_by > 0
      ? { scoredBy: raw.scored_by }
      : {}),
    // Left in MyAnimeList's readable casing ("Light novel") rather than forced
    // to AniList's LIGHT_NOVEL: the details page prints this verbatim.
    source: raw.source?.trim() || null,
    relations: mapRelations(raw),
  };
}
