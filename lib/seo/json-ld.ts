import type { AnimeDetails } from "@/lib/types/anime";
import type { GameDetails } from "@/lib/types/game";
import type { ChannelDetails } from "@/lib/types/youtube";
import type { TitleDetails } from "@/lib/types";
import { absoluteUrl } from "@/lib/seo/site";
import { posterUrl } from "@/lib/utils/tmdb-image";
import { truncateDescription } from "@/lib/seo/detail-metadata";

/**
 * Schema.org descriptions of what each page is about.
 *
 * The meta tags say what to print in a result; these say what the thing *is* —
 * a film with a rating, a series with an episode count, a game with a
 * publisher — which is what a search engine needs before it will show anything
 * richer than a blue link.
 *
 * Two rules run through every builder here. Absolute URLs, because a crawler
 * reads this JSON on its own and `metadataBase` does not reach inside a script
 * tag. And nothing invented: a field the catalogue did not supply is left out
 * rather than filled with a plausible default, since wrong structured data is
 * worse than none.
 */
export type JsonLd = Record<string, unknown> & { "@type": string };

/**
 * Longer than the 160-char meta description — this text is read, not
 * displayed, so the whole plot summary is useful — but still bounded, because
 * it ships in the HTML of every page.
 */
export const JSON_LD_DESCRIPTION_LIMIT = 500;

function describe(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? truncateDescription(clean, JSON_LD_DESCRIPTION_LIMIT) : null;
}

/** Drops the keys whose value is null, so callers can build in one expression. */
function compact(node: Record<string, unknown>): JsonLd {
  return Object.fromEntries(
    Object.entries(node).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      return !(Array.isArray(value) && value.length === 0);
    })
  ) as JsonLd;
}

/**
 * A rating a search engine will accept.
 *
 * Google requires a sample size alongside the average and treats a bare
 * `ratingValue` as an error, so a source that reports no count — Steam's
 * Metacritic number, for one — gets no aggregateRating at all rather than an
 * invalid one.
 */
function aggregateRating(value: number | null, count: number | undefined): JsonLd | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  if (!count || count <= 0) return null;
  return {
    "@type": "AggregateRating",
    ratingValue: Number(value.toFixed(1)),
    bestRating: 10,
    worstRating: 0,
    ratingCount: count,
  };
}

function organizations(names: string[]): JsonLd[] {
  return names.filter(Boolean).map((name) => ({ "@type": "Organization", name }));
}

/** Films and series from TMDB. `/title/[id]` serves both. */
export function titleJsonLd(details: TitleDetails, path: string): JsonLd {
  const isSeries = details.mediaType === "tv";
  return compact({
    "@context": "https://schema.org",
    "@type": isSeries ? "TVSeries" : "Movie",
    name: details.title,
    url: absoluteUrl(path),
    description: describe(details.overview),
    image: posterUrl(details.posterPath, "w500"),
    // TMDB leaves this empty rather than absent on unreleased entries.
    datePublished: details.releaseDate || null,
    genre: details.genres.map((genre) => genre.name),
    // ISO 8601 duration. Only films carry one; a series runtime would be
    // per-episode, which TMDB reports separately and this page does not load.
    duration: !isSeries && details.runtime ? `PT${details.runtime}M` : null,
    numberOfSeasons: isSeries ? details.numberOfSeasons : null,
    aggregateRating: aggregateRating(details.voteAverage, details.voteCount),
  });
}

/**
 * Anime, described as a TVSeries.
 *
 * Schema.org has no anime type — `TVAnime` belongs to a different vocabulary —
 * and TVSeries is what every consumer of this data understands.
 */
export function animeJsonLd(details: AnimeDetails, path: string): JsonLd {
  return compact({
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: details.title,
    url: absoluteUrl(path),
    description: describe(details.description),
    image: details.coverImage,
    // AniList publishes a start year, not a start date; a bare year is a valid
    // ISO 8601 value and is the most precise thing that is actually true.
    datePublished: details.year ? String(details.year) : null,
    numberOfEpisodes: details.episodes,
    genre: details.genres,
    alternateName: [details.titles.english, details.titles.romaji, details.titles.native]
      .filter((name): name is string => Boolean(name) && name !== details.title)
      .slice(0, 3),
    productionCompany: organizations(details.studios),
    aggregateRating: aggregateRating(details.score, details.scoredBy),
  });
}

/**
 * Release dates, minus the precision the games catalogues do not have.
 *
 * Steam publishes a localized display string ("18 мая. 2015 г.") that no
 * parser handles, so its mapper keeps the year and pads it to January 1st.
 * IGDB pads the same way for anything it only knows the year of. Reporting
 * that padding as a release day would state something false, and a bare year
 * is a valid ISO 8601 date, so anything landing exactly on the 1st of January
 * is published as the year alone.
 */
function gameReleaseDate(releaseDate: string | null): string | null {
  if (!releaseDate) return null;
  return releaseDate.endsWith("-01-01") ? releaseDate.slice(0, 4) : releaseDate;
}

export function gameJsonLd(details: GameDetails, path: string): JsonLd {
  return compact({
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: details.title,
    url: absoluteUrl(path),
    description: describe(details.shortDescription),
    image: details.posterPath ?? details.fallbackImage ?? details.headerImage,
    datePublished: gameReleaseDate(details.releaseDate),
    genre: details.genres,
    gamePlatform: details.platforms,
    author: organizations(details.developers),
    publisher: organizations(details.publishers),
    sameAs: details.website,
    aggregateRating: aggregateRating(details.score, details.ratingCount),
  });
}

/**
 * A YouTube channel, described as the organization behind it.
 *
 * `url` points at the channel rather than at this page: the channel is where
 * the entity actually lives, and `mainEntityOfPage` is the field that says
 * "and here is the page describing it".
 */
export function channelJsonLd(details: ChannelDetails, path: string): JsonLd {
  const channelUrl = `https://www.youtube.com/channel/${details.channelId}`;
  return compact({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: details.title,
    url: channelUrl,
    mainEntityOfPage: absoluteUrl(path),
    description: describe(details.description),
    image: details.thumbnailUrl,
    logo: details.thumbnailUrl,
    sameAs: details.handle ? [`https://www.youtube.com/${details.handle}`] : null,
    foundingDate: details.publishedAt ? details.publishedAt.slice(0, 10) : null,
    interactionStatistic: details.subscriberCount
      ? {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/SubscribeAction",
          userInteractionCount: details.subscriberCount,
        }
      : null,
  });
}

/**
 * The exact text to put inside a `<script type="application/ld+json">`.
 *
 * JSON.stringify leaves `<` alone, so a title containing "</script>" would
 * close the tag early and spill the rest of the payload into the document.
 * `<` is the same character to a JSON parser and inert to an HTML one.
 */
export function jsonLdScript(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export interface ItemListEntry {
  /** The Schema.org type of the thing being linked — Movie, TVSeries, … */
  type: string;
  name: string;
  /** Rooted path of its details page. */
  path: string;
}

/**
 * How many entries a catalogue's list advertises.
 *
 * The listings do not all return the same number — YouTube discovery answers
 * with a couple of hundred channels where TMDB answers with forty — and every
 * one of them would ship as JSON in the page. A page's worth is enough to show
 * a crawler what the catalogue holds; the rest it reaches by following links.
 */
export const MAX_LIST_ITEMS = 30;

/**
 * The default listing of a catalogue page.
 *
 * Names and links only. The full record lives on each entry's own page, and
 * repeating it thirty times over would bloat the catalogue HTML to say nothing
 * the crawler cannot get by following the link.
 */
export function itemListJsonLd(entries: ItemListEntry[], path: string, name: string): JsonLd {
  const listed = entries.slice(0, MAX_LIST_ITEMS);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: absoluteUrl(path),
    numberOfItems: listed.length,
    itemListElement: listed.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": entry.type,
        name: entry.name,
        url: absoluteUrl(entry.path),
      },
    })),
  };
}
