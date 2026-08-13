/** Raw shapes returned by IGDB v4 (subset of fields we actually request). */

export interface IGDBNamed {
  id: number;
  name: string;
}

export interface IGDBImage {
  id: number;
  /** Slug used to build a CDN url at any size — see mappers.imageUrl. */
  image_id: string;
}

export interface IGDBCompanyRole {
  id: number;
  developer?: boolean;
  publisher?: boolean;
  company?: IGDBNamed;
}

export interface IGDBWebsite {
  id: number;
  url: string;
  /** 1 = official site, 13 = Steam. */
  category?: number;
}

export interface IGDBGame {
  id: number;
  name: string;
  summary?: string;
  storyline?: string;
  cover?: IGDBImage;
  artworks?: IGDBImage[];
  screenshots?: IGDBImage[];
  genres?: IGDBNamed[];
  platforms?: IGDBNamed[];
  game_modes?: IGDBNamed[];
  involved_companies?: IGDBCompanyRole[];
  websites?: IGDBWebsite[];
  /** Unix seconds. */
  first_release_date?: number;
  /** IGDB user score, 0-100. */
  rating?: number;
  /** Aggregated critic score, 0-100 — IGDB's stand-in for Metacritic. */
  aggregated_rating?: number;
  total_rating?: number;
  /** How many ratings a game has — IGDB's usable popularity signal (`follows` is empty catalog-wide). */
  total_rating_count?: number;
}
