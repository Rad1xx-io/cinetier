/** Raw shapes returned by AniList's GraphQL API (subset of fields we actually use). */

export interface AniListTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

export interface AniListCoverImage {
  large: string | null;
  medium: string | null;
  color: string | null;
}

export interface AniListStudioNode {
  name: string;
}

export interface AniListRelationNode {
  id: number;
  title: { romaji: string | null };
  type: string;
  format: string | null;
  coverImage: { medium: string | null } | null;
}

export interface AniListRelationEdge {
  relationType: string;
  node: AniListRelationNode;
}

export interface AniListMedia {
  id: number;
  title: AniListTitle;
  description: string | null;
  coverImage: AniListCoverImage | null;
  bannerImage: string | null;
  startDate: { year: number | null; month: number | null; day: number | null } | null;
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  duration: number | null;
  status: string | null;
  genres: string[];
  averageScore: number | null;
  favourites: number | null;
  studios: { nodes: AniListStudioNode[] } | null;
  format: string | null;
  source: string | null;
  relations: { edges: AniListRelationEdge[] } | null;
}

export interface AniListPageInfo {
  total: number;
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
}

export interface AniListPageResponse {
  Page: {
    pageInfo: AniListPageInfo;
    media: AniListMedia[];
  };
}

export interface AniListMediaResponse {
  Media: AniListMedia | null;
}

export interface AniListGenreCollectionResponse {
  GenreCollection: string[];
}
