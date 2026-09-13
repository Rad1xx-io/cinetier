/** The fields this app reads from one entry of iTunes Search's `entity=software` response. Everything else in the real payload is ignored. */
export interface ITunesSoftwareResult {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl512?: string;
  artworkUrl100?: string;
  description?: string;
  releaseDate?: string;
  /** Apple's own top-level classification — always exactly "Games" for a real game, verified live against 16 real titles spanning every sub-genre (Action, Puzzle, Strategy, Roleplaying, Board, Word, Racing, …). Sub-genres only ever show up in `genres` below, never here. */
  primaryGenreName?: string;
  genres?: string[];
  averageUserRating?: number;
  userRatingCount?: number;
  formattedPrice?: string;
  price?: number;
  trackViewUrl: string;
  minimumOsVersion?: string;
}

export interface ITunesSearchResponse {
  resultCount: number;
  results: ITunesSoftwareResult[];
}
