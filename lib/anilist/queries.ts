const MEDIA_FIELDS = `
  id
  title { romaji english native }
  # AniList has no Russian title field; community-submitted ones live here and
  # are what the mapper promotes to the headline for a Russian-language UI.
  synonyms
  description(asHtml: false)
  coverImage { large medium color }
  bannerImage
  startDate { year month day }
  season
  seasonYear
  episodes
  duration
  status
  genres
  averageScore
  favourites
  studios(isMain: true) { nodes { name } }
  format
  source
  relations {
    edges {
      relationType
      node { id title { romaji } type format coverImage { medium } }
    }
  }
`;

/** Combined discovery query — search text, genre, year, season and status all narrow the same query server-side. */
export const DISCOVER_ANIME_QUERY = `
  query (
    $page: Int
    $perPage: Int
    $search: String
    $genre: String
    $seasonYear: Int
    $season: MediaSeason
    $status: MediaStatus
    $format: MediaFormat
    $sort: [MediaSort]
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage }
      media(
        type: ANIME
        search: $search
        genre: $genre
        seasonYear: $seasonYear
        season: $season
        status: $status
        format: $format
        sort: $sort
        isAdult: false
      ) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

export const ANIME_DETAILS_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      ${MEDIA_FIELDS}
      # Details only. AniList publishes no "number of scores" field, so the
      # distribution is the only place that count exists — and asking for it
      # on the listing query would fetch ten buckets per card for something no
      # card shows.
      stats { scoreDistribution { score amount } }
    }
  }
`;

export const GENRE_COLLECTION_QUERY = `query { GenreCollection }`;
