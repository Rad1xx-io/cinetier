/** The fields this app reads from one entry of iTunes Search's `entity=software` response. Everything else in the real payload is ignored. */
export interface ITunesSoftwareResult {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl512?: string;
  artworkUrl100?: string;
  description?: string;
  releaseDate?: string;
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
