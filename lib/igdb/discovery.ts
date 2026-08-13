import "server-only";
import { igdbFetch } from "@/lib/igdb/client";
import { expandQueryVariants } from "@/lib/games/query-variants";
import { mapGameToDetails, mapGameToSummary } from "@/lib/igdb/mappers";
import type { IGDBGame, IGDBNamed } from "@/lib/igdb/types";
import type { GameCategory, GameGenre, GamePlatform, GameSort } from "@/lib/steam/filters";
import type { GameDetails, GameSummary } from "@/lib/types/game";

export const GAMES_PAGE_SIZE = 36;

/**
 * Only what a grid card draws: cover, title, score, year, genres.
 *
 * The catalog asks for 36 games at a time, and the fields left out here are the
 * expensive ones — `summary` alone is a paragraph per row, and artworks,
 * screenshots and company joins each make IGDB do extra work no card displays.
 * Filtering by platform still works without selecting it: a `where` clause
 * matches on fields it does not have to return.
 */
const LIST_FIELDS = `
  fields name, cover.image_id, genres.name,
         first_release_date, rating, aggregated_rating, total_rating_count;
`;

/** The full record, fetched one game at a time for the details page. */
const DETAIL_FIELDS = `
  fields name, summary, cover.image_id, artworks.image_id, screenshots.image_id,
         genres.name, platforms.name, game_modes.name,
         involved_companies.developer, involved_companies.publisher, involved_companies.company.name,
         websites.url, websites.category,
         first_release_date, rating, aggregated_rating, total_rating_count;
`;

/**
 * IGDB's own vocabularies, fetched once and matched by name.
 *
 * Hardcoding IGDB's numeric ids would be guessing at values that cannot be
 * checked without credentials, and a wrong id fails silently as "no results".
 * Asking IGDB for its own list and matching on names is self-correcting: if a
 * name is missing the filter is dropped rather than returning an empty page.
 */
interface Vocabulary {
  genres: IGDBNamed[];
  platforms: IGDBNamed[];
  gameModes: IGDBNamed[];
}

let vocabulary: Vocabulary | null = null;
let pendingVocabulary: Promise<Vocabulary> | null = null;

async function loadVocabulary(): Promise<Vocabulary> {
  if (vocabulary) return vocabulary;
  if (pendingVocabulary) return pendingVocabulary;

  pendingVocabulary = (async () => {
    const [genres, platforms, gameModes] = await Promise.all([
      igdbFetch<IGDBNamed[]>("genres", "fields name; limit 100;"),
      igdbFetch<IGDBNamed[]>("platforms", "fields name; limit 500;"),
      igdbFetch<IGDBNamed[]>("game_modes", "fields name; limit 50;"),
    ]);
    vocabulary = { genres, platforms, gameModes };
    return vocabulary;
  })().finally(() => {
    pendingVocabulary = null;
  });

  return pendingVocabulary;
}

function idsByName(list: IGDBNamed[], wanted: string[]): number[] {
  const lower = wanted.map((w) => w.toLowerCase());
  return list
    .filter((entry) => lower.some((w) => entry.name.toLowerCase().includes(w)))
    .map((entry) => entry.id);
}

/**
 * CineTier's filter vocabulary came from Steam, which splits the catalog
 * differently from IGDB — IGDB has no "Action" genre (it files those under
 * Shooter/Fighting/Platform) and no "Casual". Each of ours therefore maps to a
 * set of IGDB names rather than one.
 */
const GENRE_SYNONYMS: Record<GameGenre, string[]> = {
  Action: ["Shooter", "Fighting", "Hack and slash", "Arcade", "Platform"],
  Adventure: ["Adventure", "Point-and-click"],
  RPG: ["Role-playing"],
  Strategy: ["Strategy", "Tactical", "MOBA"],
  Simulation: ["Simulator"],
  Indie: ["Indie"],
  Casual: ["Puzzle", "Quiz", "Card & Board", "Pinball"],
  Racing: ["Racing"],
  Sports: ["Sport"],
  "Massively Multiplayer": ["MOBA"],
};

const PLATFORM_SYNONYMS: Record<GamePlatform, string[]> = {
  win: ["PC (Microsoft Windows)"],
  mac: ["Mac"],
  linux: ["Linux"],
};

const CATEGORY_SYNONYMS: Record<GameCategory, string[]> = {
  "2": ["Single player"],
  "1": ["Multiplayer"],
  "9": ["Co-operative"],
};

const SORT_CLAUSES: Record<GameSort, { sort: string; requires?: string }> = {
  // `follows` reads as empty for the whole catalog, so ranking by it returns
  // nothing; the rating-count is IGDB's usable popularity signal.
  popularity: { sort: "total_rating_count desc", requires: "total_rating_count != null" },
  // A bare rating sort floats obscure titles sitting on a perfect 100 from a
  // couple of reviews, so a minimum sample size is part of the sort itself.
  metacritic: {
    sort: "aggregated_rating desc",
    requires: "aggregated_rating != null & aggregated_rating_count > 4",
  },
  released: { sort: "first_release_date desc", requires: "first_release_date != null" },
  name: { sort: "name asc" },
};

/**
 * Strips everything that has meaning to APICalypse or to IGDB's edge filter.
 *
 * Every other catalog parameterises its search — TMDB and YouTube through
 * URLSearchParams, AniList through GraphQL variables — but IGDB's query is a
 * string this code assembles, so the term is the one value that lands inside
 * query syntax. Escaping only the double quote was not enough: a trailing
 * backslash escapes the escape and lets the string terminate early. Removing
 * the characters outright is simpler to reason about and costs nothing, because
 * none of them appear in a game title. Angle brackets go too — sending
 * `<script>` verbatim makes IGDB's edge return 403, which surfaced to the user
 * as "не удалось загрузить игры" instead of an empty result.
 */
function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[\\"'`;{}()<>\[\]]/g, " ")
    // Control characters would terminate the statement or confuse the parser.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export interface DiscoverGamesParams {
  query?: string;
  genre?: GameGenre;
  platform?: GamePlatform;
  category?: GameCategory;
  sort?: GameSort;
  /** 0-based. */
  page?: number;
}

export interface DiscoverGamesResult {
  results: GameSummary[];
  hasMore: boolean;
}

export async function discoverGames(params: DiscoverGamesParams): Promise<DiscoverGamesResult> {
  const page = Math.max(0, params.page ?? 0);
  const offset = page * GAMES_PAGE_SIZE;
  const query = params.query?.trim();

  // The vocabularies are three extra round trips and are only ever consulted to
  // translate a filter into ids, so an unfiltered browse or plain search skips
  // them entirely — that is the common case and the whole of a cold first load.
  const needsVocabulary = Boolean(params.genre || params.platform || params.category);
  const vocab = needsVocabulary ? await loadVocabulary() : null;

  const where: string[] = [
    // Drops alternate editions, keeping one row per game.
    "version_parent = null",
    // Excludes add-ons rather than selecting main games: IGDB's old `category`
    // field is dead (any query using it returns nothing), and its replacement
    // files Minecraft under 11, not 0 — so an allow-list would drop exactly the
    // titles this migration exists to fix. Blocking DLC, expansions, seasons,
    // packs and updates keeps "Rocket League" ahead of its Rocketeer Packs.
    "game_type != (1,2,7,13,14)",
  ];

  if (vocab) {
    if (params.genre) {
      const ids = idsByName(vocab.genres, GENRE_SYNONYMS[params.genre]);
      if (ids.length) where.push(`genres = (${ids.join(",")})`);
    }
    if (params.platform) {
      const ids = idsByName(vocab.platforms, PLATFORM_SYNONYMS[params.platform]);
      if (ids.length) where.push(`platforms = (${ids.join(",")})`);
    }
    if (params.category) {
      const ids = idsByName(vocab.gameModes, CATEGORY_SYNONYMS[params.category]);
      if (ids.length) where.push(`game_modes = (${ids.join(",")})`);
    }
  }

  const sortKey = params.sort ?? "popularity";
  const sortClause = SORT_CLAUSES[sortKey];

  // A text search is ranked by IGDB's own relevance and ignores `sort`, so the
  // sort control only applies while browsing — same as Steam's store search.
  if (!query && sortClause.requires) where.push(sortClause.requires);

  // One extra row is a cheap, exact answer to "is there another page?".
  const limit = GAMES_PAGE_SIZE + 1;
  const whereClause = where.length ? `where ${where.join(" & ")};` : "";

  function buildQuery(term: string | undefined): string {
    return [
      LIST_FIELDS.trim(),
      term ? `search "${sanitizeSearchTerm(term)}";` : "",
      whereClause,
      term ? "" : `sort ${sortClause.sort};`,
      `limit ${limit};`,
      `offset ${offset};`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * A Cyrillic query is asked both ways.
   *
   * IGDB indexes some Russian titles through alternative names — "дота 2"
   * finds Dota 2 on its own — but not others: "елден ринг" returns nothing
   * while "elden ring" returns three. Searching the original *and* its
   * transliteration keeps the first case working instead of trading it away.
   */
  const terms = query ? expandQueryVariants(query) : [undefined];
  const pages = await Promise.all(terms.map((term) => igdbFetch<IGDBGame[]>("games", buildQuery(term))));

  const seen = new Set<number>();
  const merged: IGDBGame[] = [];
  for (const games of pages) {
    for (const game of games) {
      if (!seen.has(game.id)) {
        seen.add(game.id);
        merged.push(game);
      }
    }
  }

  return {
    results: merged.slice(0, GAMES_PAGE_SIZE).map(mapGameToSummary),
    // Any variant still holding a full page means there is more to show.
    hasMore: pages.some((games) => games.length > GAMES_PAGE_SIZE),
  };
}

export async function getGameDetails(id: number): Promise<GameDetails | null> {
  const raw = await igdbFetch<IGDBGame[]>(
    "games",
    `${DETAIL_FIELDS.trim()}\nwhere id = ${id};\nlimit 1;`
  );
  return raw[0] ? mapGameToDetails(raw[0]) : null;
}
