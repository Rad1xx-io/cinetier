/** Raw shapes returned by the TMDB API (subset of fields we actually use). */

export interface TMDBRawGenre {
  id: number;
  name: string;
}

export interface TMDBRawMovie {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  overview: string;
  vote_average: number;
  genre_ids?: number[];
  genres?: TMDBRawGenre[];
  runtime?: number | null;
  status?: string;
  media_type?: string;
}

export interface TMDBRawTVShow {
  id: number;
  name: string;
  original_name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string | null;
  overview: string;
  vote_average: number;
  genre_ids?: number[];
  genres?: TMDBRawGenre[];
  number_of_seasons?: number | null;
  status?: string;
  media_type?: string;
}

export type TMDBRawResult = TMDBRawMovie | TMDBRawTVShow;

export interface TMDBPagedResponse<T> {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
}

export interface TMDBErrorResponse {
  status_code: number;
  status_message: string;
}
