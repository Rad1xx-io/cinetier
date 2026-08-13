import type { GameDetails, GameSummary } from "@/lib/types/game";
import type { IGDBGame } from "@/lib/igdb/types";

/**
 * IGDB serves one image per size preset. `t_cover_big_2x` is 528x748 — the same
 * 2:3 portrait shape the movie and anime posters use, so game covers drop into
 * the shared tier list without a separate layout.
 */
const COVER_SIZE = "t_cover_big_2x";
const COVER_FALLBACK_SIZE = "t_cover_big";
const BANNER_SIZE = "t_1080p";

/** Urls come back protocol-relative (`//images.igdb.com/...`). */
function imageUrl(imageId: string | undefined, size: string): string | null {
  if (!imageId) return null;
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
}

/** IGDB scores are 0-100; the rest of CineTier ranks on 0-10. */
function toTenPointScale(value: number | undefined): number | null {
  if (value === undefined || value === null) return null;
  return Math.round(value) / 10;
}

function releaseDate(unixSeconds: number | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function companies(raw: IGDBGame, role: "developer" | "publisher"): string[] {
  return (raw.involved_companies ?? [])
    .filter((entry) => entry[role] && entry.company?.name)
    .map((entry) => entry.company!.name);
}

export function mapGameToSummary(raw: IGDBGame): GameSummary {
  const banner =
    imageUrl(raw.artworks?.[0]?.image_id, BANNER_SIZE) ??
    imageUrl(raw.screenshots?.[0]?.image_id, BANNER_SIZE);

  return {
    appId: raw.id,
    title: raw.name,
    posterPath: imageUrl(raw.cover?.image_id, COVER_SIZE),
    headerImage: banner,
    // Same art at a smaller preset: if the 2x cover fails to load, this one is
    // the closest thing still in the right aspect ratio.
    fallbackImage: imageUrl(raw.cover?.image_id, COVER_FALLBACK_SIZE) ?? banner,
    shortDescription: raw.summary ?? "",
    genres: (raw.genres ?? []).map((g) => g.name),
    categories: (raw.game_modes ?? []).map((m) => m.name),
    platforms: (raw.platforms ?? []).map((p) => p.name),
    developers: companies(raw, "developer"),
    releaseDate: releaseDate(raw.first_release_date),
    // Prefer the critic aggregate, fall back to the user score.
    score: toTenPointScale(raw.aggregated_rating ?? raw.rating),
    // IGDB is a catalog, not a storefront — it carries no pricing.
    isFree: false,
    price: null,
  };
}

export function mapGameToDetails(raw: IGDBGame): GameDetails {
  const official = raw.websites?.find((w) => w.category === 1) ?? raw.websites?.[0];
  return {
    ...mapGameToSummary(raw),
    publishers: companies(raw, "publisher"),
    website: official?.url ?? null,
  };
}
