import type { TMDBMediaType, TitleDetails, TitleSummary } from "@/lib/types";
import type { TMDBRawMovie, TMDBRawTVShow } from "@/lib/tmdb/types";

function isTVShow(raw: TMDBRawMovie | TMDBRawTVShow): raw is TMDBRawTVShow {
  return "name" in raw;
}

export function mapToSummary(
  raw: TMDBRawMovie | TMDBRawTVShow,
  fallbackMediaType?: TMDBMediaType
): TitleSummary {
  const mediaType: TMDBMediaType = isTVShow(raw) ? "tv" : fallbackMediaType ?? "movie";
  const tv = isTVShow(raw) ? raw : null;
  const movie = !tv ? (raw as TMDBRawMovie) : null;
  const originalTitle = tv ? tv.original_name : movie!.original_title;
  // TMDB returns an empty string (not a missing field) when no localized title
  // exists for the requested language — fall back to the original title so the
  // UI never shows a blank card.
  const localizedTitle = tv ? tv.name : movie!.title;
  const title = localizedTitle && localizedTitle.length > 0 ? localizedTitle : originalTitle;

  return {
    tmdbId: raw.id,
    mediaType,
    title,
    originalTitle,
    posterPath: raw.poster_path,
    backdropPath: raw.backdrop_path,
    releaseDate: tv ? tv.first_air_date : movie!.release_date,
    overview: raw.overview ?? "",
    voteAverage: raw.vote_average ?? 0,
    genreIds: raw.genre_ids ?? raw.genres?.map((g) => g.id) ?? [],
  };
}

export function mapToDetails(
  raw: TMDBRawMovie | TMDBRawTVShow,
  mediaType: TMDBMediaType
): TitleDetails {
  const summary = mapToSummary(raw, mediaType);
  const tv = isTVShow(raw) ? raw : null;
  const movie = !tv ? (raw as TMDBRawMovie) : null;

  return {
    ...summary,
    genres: raw.genres ?? [],
    runtime: movie?.runtime ?? null,
    numberOfSeasons: tv?.number_of_seasons ?? null,
    status: raw.status ?? null,
    ...(typeof raw.vote_count === "number" ? { voteCount: raw.vote_count } : {}),
  };
}
