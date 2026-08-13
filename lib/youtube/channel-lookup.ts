import "server-only";
import { youtubeFetch } from "@/lib/youtube/client";
import { mapChannelToSummary } from "@/lib/youtube/mappers";
import { searchWithFallback } from "@/lib/search/with-fallback";
import type {
  YouTubeChannelItem,
  YouTubeChannelsResponse,
  YouTubeSearchResponse,
  YouTubeVideosResponse,
} from "@/lib/youtube/types";
import type { ChannelSummary } from "@/lib/types/youtube";

const CHANNELS_LIST_BATCH_SIZE = 50;

/**
 * Defaults for an unfiltered browse or search. The UI is Russian, so the
 * catalog people see before touching any filter should be too — previously it
 * opened on the US trending chart regardless.
 */
const DEFAULT_REGION = "RU";
const DEFAULT_RELEVANCE_LANGUAGE = "ru";

/** channels.list accepts at most 50 ids per call, so large id lists are fetched in parallel chunks. */
async function enrichChannelIds(channelIds: string[]): Promise<ChannelSummary[]> {
  if (channelIds.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < channelIds.length; i += CHANNELS_LIST_BATCH_SIZE) {
    chunks.push(channelIds.slice(i, i + CHANNELS_LIST_BATCH_SIZE));
  }

  const chunkResponses = await Promise.all(
    chunks.map((chunk) =>
      youtubeFetch<YouTubeChannelsResponse>("/channels", {
        part: "snippet,statistics",
        id: chunk.join(","),
        maxResults: CHANNELS_LIST_BATCH_SIZE,
      })
    )
  );

  const byId = new Map<string, YouTubeChannelItem>();
  for (const response of chunkResponses) {
    for (const item of response.items) byId.set(item.id, item);
  }

  return channelIds
    .map((id) => byId.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map(mapChannelToSummary);
}

/**
 * `regionCode` on YouTube's search/trending endpoints means "content relevant
 * to viewers in this region" — it does NOT mean "the channel is based there".
 * The only reliable per-channel country is `snippet.country` from channels.list,
 * which channel owners set voluntarily (many leave it blank). Once a country is
 * selected we filter on that real field instead of trusting regionCode.
 */
function filterByChannelCountry(results: ChannelSummary[], countryCode: string): ChannelSummary[] {
  return results.filter((c) => c.country === countryCode);
}

function dedupeIds(...idLists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ids of idLists) {
    for (const id of ids) {
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

/**
 * YouTube's official video category IDs, used to pull more trending "lanes"
 * for a region. `undefined` = the default overall trending chart. There is no
 * "popular channels" endpoint — only videos.list?chart=mostPopular, capped at
 * 50 videos per call, so a single call collapses to a handful of unique
 * channels once duplicates are removed. Pulling one call per category and
 * merging the unique channels behind all of them widens that pool without
 * pretending it's a real "browse channels by X" query.
 */
const TRENDING_CATEGORIES: (string | undefined)[] = [
  undefined, // overall trending
  "10", // Music
  "20", // Gaming
  "24", // Entertainment
  "22", // People & Blogs
  "23", // Comedy
  "17", // Sports
];

async function trendingChannelIds(regionCode: string): Promise<string[]> {
  const videoBatches = await Promise.all(
    TRENDING_CATEGORIES.map((videoCategoryId) =>
      youtubeFetch<YouTubeVideosResponse>("/videos", {
        part: "snippet",
        chart: "mostPopular",
        regionCode,
        videoCategoryId,
        maxResults: 50,
      }).catch(() => ({ items: [] }) as YouTubeVideosResponse)
    )
  );

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const batch of videoBatches) {
    for (const item of batch.items) {
      const id = item.snippet.channelId;
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

/**
 * search.list requires a `q` — an empty query returns 0 results (verified
 * empirically), so there is no direct "give me channels from country X" call.
 * When the user picks a country with no search text, we run a handful of
 * broad, generic seed queries biased with regionCode instead of relying only
 * on the day's trending chart — a real (if imperfect) slice of YouTube's
 * search index for that country, not just whatever is trending today.
 */
const DISCOVERY_SEED_QUERIES = ["vlog", "gaming", "music", "comedy", "news", "influencer"];

async function seedSearchChannelIds(regionCode: string): Promise<string[]> {
  const responses = await Promise.all(
    DISCOVERY_SEED_QUERIES.map((q) =>
      youtubeFetch<YouTubeSearchResponse>("/search", {
        part: "snippet",
        type: "channel",
        maxResults: 50,
        q,
        regionCode,
        // The seed queries are English words used purely to reach the index;
        // the region is what makes the results local, so no language bias here.
      }).catch(() => ({ items: [] }) as YouTubeSearchResponse)
    )
  );

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const response of responses) {
    for (const item of response.items) {
      const id = item.id.channelId;
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

export type ChannelSortMode =
  | "subscribers_desc"
  | "subscribers_asc"
  | "views_desc"
  | "views_asc"
  | "newest"
  | "title";

function sortChannels(list: ChannelSummary[], sort: ChannelSortMode): ChannelSummary[] {
  const copy = [...list];
  switch (sort) {
    case "subscribers_asc":
      return copy.sort((a, b) => (a.subscriberCount ?? -1) - (b.subscriberCount ?? -1));
    case "views_desc":
      return copy.sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1));
    case "views_asc":
      return copy.sort((a, b) => (a.viewCount ?? -1) - (b.viewCount ?? -1));
    case "newest":
      return copy.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title, "ru"));
    case "subscribers_desc":
    default:
      return copy.sort((a, b) => (b.subscriberCount ?? -1) - (a.subscriberCount ?? -1));
  }
}

export interface DiscoverChannelsParams {
  /** Free-text search. When present, drives the discovery query itself. */
  query?: string;
  /** ISO 3166-1 country code. When present (with or without a query), triggers
   *  country-specific discovery queries, then strict-filters by the channel's
   *  real declared country — never just a post-hoc filter over a generic pool. */
  country?: string;
  minSubscribers?: number;
  sort?: ChannelSortMode;
  /** Only meaningful when `query` is set — continues that real search.list page. */
  pageToken?: string;
}

export interface DiscoverChannelsResult {
  results: ChannelSummary[];
  /** Present only for text search — lets the client fetch a further real page
   *  once its local pool of already-fetched results is exhausted. */
  nextPageToken?: string;
  /** Spelling that rescued a thin search, for the "возможно, вы искали" hint. */
  correctedQuery?: string | null;
}

/**
 * Single discovery entry point for both the "browse" and "search" surfaces of
 * the YouTube Channels page. Country, search text, subscriber floor and sort
 * are combined at the query level (not applied as a filter over an already-
 * tiny result set): a country drives which discovery queries run, the
 * subscriber floor and sort are applied server-side to the merged, deduped,
 * enriched pool before it's ever sent to the client.
 */
/**
 * One search.list call, with the region and language defaults applied.
 *
 * `relevanceLanguage` is only sent when no country is chosen: this is a
 * Russian-language app, so an unqualified search should lean Russian, but once
 * someone asks for Japan a Russian bias fights the filter they just set.
 */
async function searchChannelsOnce(
  term: string,
  country: string | undefined,
  pageToken: string | undefined
): Promise<YouTubeSearchResponse> {
  return youtubeFetch<YouTubeSearchResponse>("/search", {
    part: "snippet",
    type: "channel",
    maxResults: 50,
    q: term,
    regionCode: country ?? DEFAULT_REGION,
    relevanceLanguage: country ? undefined : DEFAULT_RELEVANCE_LANGUAGE,
    pageToken,
  });
}

/** Retries with a corrected spelling when the typed term finds almost nothing. */
async function searchChannels(
  query: string,
  country: string | undefined,
  pageToken: string | undefined
): Promise<YouTubeSearchResponse & { correctedQuery: string | null }> {
  let nextPageToken: string | undefined;

  const { results, correctedQuery } = await searchWithFallback(
    query,
    async (term) => {
      const data = await searchChannelsOnce(term, country, pageToken);
      nextPageToken ??= data.nextPageToken;
      return data.items;
    },
    (item) => item.id.channelId ?? ""
  );

  return { items: results, nextPageToken, correctedQuery };
}

export async function discoverChannels(
  params: DiscoverChannelsParams
): Promise<DiscoverChannelsResult> {
  const country = params.country?.trim() || undefined;
  const query = params.query?.trim() || undefined;
  const minSubscribers = params.minSubscribers ?? 0;
  const sort = params.sort ?? "subscribers_desc";

  let channelIds: string[];
  let nextPageToken: string | undefined;
  let correctedQuery: string | null = null;

  if (query) {
    const searchData = await searchChannels(query, country, params.pageToken);
    channelIds = dedupeIds(searchData.items.map((item) => item.id.channelId).filter(Boolean) as string[]);
    nextPageToken = searchData.nextPageToken;
    correctedQuery = searchData.correctedQuery;
  } else if (country) {
    const [seedIds, trendIds] = await Promise.all([
      seedSearchChannelIds(country),
      trendingChannelIds(country),
    ]);
    channelIds = dedupeIds(seedIds, trendIds);
  } else {
    channelIds = await trendingChannelIds(DEFAULT_REGION);
  }

  let results = await enrichChannelIds(channelIds);

  if (country) {
    results = filterByChannelCountry(results, country);
  }
  if (minSubscribers > 0) {
    results = results.filter((c) => (c.subscriberCount ?? 0) >= minSubscribers);
  }

  results = sortChannels(results, sort);

  return { results, nextPageToken: query ? nextPageToken : undefined, correctedQuery };
}
