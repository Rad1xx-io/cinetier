/** Raw shapes returned by Jikan v4 (the subset this app reads). */

export interface JikanImage {
  image_url: string | null;
  small_image_url: string | null;
  large_image_url: string | null;
}

export interface JikanNamedEntity {
  mal_id: number;
  type: string;
  name: string;
  url: string;
}

export interface JikanTitleEntry {
  /** "Default" | "Synonym" | "Japanese" | "English" | a language name. */
  type: string;
  title: string;
}

export interface JikanDatePart {
  day: number | null;
  month: number | null;
  year: number | null;
}

/** One relation group: a kind, and the entries that share it. */
export interface JikanRelation {
  relation: string;
  entry: { mal_id: number; type: string; name: string; url: string }[];
}

export interface JikanAnime {
  mal_id: number;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  title_synonyms?: string[];
  titles?: JikanTitleEntry[];
  images?: { jpg?: JikanImage; webp?: JikanImage };
  synopsis: string | null;
  /** "TV" | "Movie" | "OVA" | "ONA" | "Special" | "Music". */
  type: string | null;
  source: string | null;
  episodes: number | null;
  /** Human text, not a number: "24 min per ep", "1 hr 59 min", "Unknown". */
  duration: string | null;
  /** "Finished Airing" | "Currently Airing" | "Not yet aired". */
  status: string | null;
  airing?: boolean;
  /** Already on a 0-10 scale, unlike AniList's 0-100. */
  score: number | null;
  /** How many MyAnimeList users scored it — AniList needs a histogram sum for the same number. */
  scored_by?: number | null;
  favorites: number | null;
  year: number | null;
  /** Lowercase: "spring". */
  season: string | null;
  aired?: { prop?: { from?: JikanDatePart; to?: JikanDatePart } };
  genres?: JikanNamedEntity[];
  themes?: JikanNamedEntity[];
  demographics?: JikanNamedEntity[];
  studios?: JikanNamedEntity[];
  /** Only present on /anime/{id}/full. */
  relations?: JikanRelation[];
}

export interface JikanPagination {
  last_visible_page: number;
  has_next_page: boolean;
  current_page?: number;
}

export interface JikanListResponse {
  data: JikanAnime[];
  pagination?: JikanPagination;
}

export interface JikanSingleResponse {
  data: JikanAnime | null;
}

export interface JikanGenreResponse {
  data: JikanNamedEntity[];
}
