import { describe, expect, it } from "vitest";
import {
  animeJsonLd,
  channelJsonLd,
  gameJsonLd,
  itemListJsonLd,
  jsonLdScript,
  MAX_LIST_ITEMS,
  titleJsonLd,
} from "@/lib/seo/json-ld";
import type { AnimeDetails } from "@/lib/types/anime";
import type { GameDetails } from "@/lib/types/game";
import type { ChannelDetails } from "@/lib/types/youtube";
import type { TitleDetails } from "@/lib/types";

const movie: TitleDetails = {
  tmdbId: 27205,
  mediaType: "movie",
  title: "Inception",
  originalTitle: "Inception",
  posterPath: "/poster.jpg",
  backdropPath: "/backdrop.jpg",
  releaseDate: "2010-07-15",
  overview: "A thief who steals corporate secrets.",
  voteAverage: 8.4,
  voteCount: 37000,
  genreIds: [28],
  genres: [{ id: 28, name: "Action" }],
  runtime: 148,
  numberOfSeasons: null,
  status: "Released",
};

const anime: AnimeDetails = {
  anilistId: 16498,
  title: "Attack on Titan",
  titles: { romaji: "Shingeki no Kyojin", english: "Attack on Titan", native: "進撃の巨人" },
  coverImage: "https://s4.anilist.co/cover.jpg",
  bannerImage: null,
  description: "Humans nearly exterminated by titans.",
  year: 2013,
  season: "SPRING",
  episodes: 25,
  duration: 24,
  status: "FINISHED",
  genres: ["Action", "Drama"],
  score: 8.5,
  scoredBy: 597876,
  favourites: 12345,
  studios: ["Wit Studio"],
  format: "TV",
  source: "MANGA",
  relations: [],
};

const game: GameDetails = {
  appId: 1942,
  title: "The Witcher 3: Wild Hunt",
  posterPath: "https://cdn/poster.jpg",
  headerImage: "https://cdn/header.jpg",
  fallbackImage: "https://cdn/fallback.jpg",
  shortDescription: "You are Geralt of Rivia, mercenary monster slayer.",
  genres: ["RPG"],
  categories: [],
  platforms: ["PC"],
  developers: ["CD Projekt Red"],
  releaseDate: "2015-05-19",
  score: 9.2,
  ratingCount: 1840,
  isFree: false,
  price: null,
  publishers: ["CD Projekt"],
  website: "https://thewitcher.com",
};

const channel: ChannelDetails = {
  channelId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
  title: "Google for Developers",
  handle: "@GoogleDevelopers",
  description: "Subscribe to join a community of creative developers.",
  thumbnailUrl: "https://yt3.ggpht.com/avatar.jpg",
  country: "US",
  subscriberCount: 2410000,
  videoCount: 6000,
  viewCount: 300000000,
  publishedAt: "2007-08-23T18:33:24Z",
  bannerUrl: null,
};

describe("titleJsonLd", () => {
  it("describes a film as a Movie at an absolute url", () => {
    const node = titleJsonLd(movie, "/title/movie-27205");
    expect(node["@context"]).toBe("https://schema.org");
    expect(node["@type"]).toBe("Movie");
    expect(node.url).toBe("https://tierlistonline.com/title/movie-27205");
    expect(node.image).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
    expect(node.datePublished).toBe("2010-07-15");
    expect(node.genre).toEqual(["Action"]);
  });

  it("states the runtime as an ISO 8601 duration", () => {
    expect(titleJsonLd(movie, "/title/movie-27205").duration).toBe("PT148M");
  });

  it("describes a series as a TVSeries with its season count and no duration", () => {
    const series = titleJsonLd(
      { ...movie, mediaType: "tv", runtime: null, numberOfSeasons: 5 },
      "/title/tv-1396"
    );
    expect(series["@type"]).toBe("TVSeries");
    expect(series.numberOfSeasons).toBe(5);
    expect(series).not.toHaveProperty("duration");
  });

  it("carries the rating together with its sample size", () => {
    expect(titleJsonLd(movie, "/title/movie-27205").aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 8.4,
      bestRating: 10,
      worstRating: 0,
      ratingCount: 37000,
    });
  });

  it("drops the rating entirely when the source reports no count", () => {
    // Google rejects a ratingValue with no ratingCount, so half a rating is
    // worse than none.
    const node = titleJsonLd({ ...movie, voteCount: undefined }, "/title/movie-27205");
    expect(node).not.toHaveProperty("aggregateRating");
  });

  it("drops an unrated entry rather than claiming a zero", () => {
    const node = titleJsonLd({ ...movie, voteAverage: 0, voteCount: 0 }, "/title/movie-27205");
    expect(node).not.toHaveProperty("aggregateRating");
  });

  it("omits the release date TMDB leaves empty on unreleased entries", () => {
    expect(titleJsonLd({ ...movie, releaseDate: "" }, "/x")).not.toHaveProperty("datePublished");
  });

  it("omits the image rather than pointing at a poster that is not there", () => {
    expect(titleJsonLd({ ...movie, posterPath: null }, "/x")).not.toHaveProperty("image");
  });
});

describe("animeJsonLd", () => {
  it("describes anime as a TVSeries — schema.org has no anime type", () => {
    const node = animeJsonLd(anime, "/anime/16498");
    expect(node["@type"]).toBe("TVSeries");
    expect(node.numberOfEpisodes).toBe(25);
    expect(node.image).toBe("https://s4.anilist.co/cover.jpg");
    expect(node.productionCompany).toEqual([{ "@type": "Organization", name: "Wit Studio" }]);
  });

  it("publishes the start year, which is all AniList reports", () => {
    expect(animeJsonLd(anime, "/anime/16498").datePublished).toBe("2013");
  });

  it("rates it against the summed score histogram", () => {
    const rating = animeJsonLd(anime, "/anime/16498").aggregateRating as Record<string, unknown>;
    expect(rating.ratingValue).toBe(8.5);
    expect(rating.ratingCount).toBe(597876);
  });

  it("lists the other names without repeating the headline", () => {
    expect(animeJsonLd(anime, "/anime/16498").alternateName).toEqual([
      "Shingeki no Kyojin",
      "進撃の巨人",
    ]);
  });
});

describe("gameJsonLd", () => {
  it("describes a game as a VideoGame with its platforms and studios", () => {
    const node = gameJsonLd(game, "/games/1942");
    expect(node["@type"]).toBe("VideoGame");
    expect(node.gamePlatform).toEqual(["PC"]);
    expect(node.author).toEqual([{ "@type": "Organization", name: "CD Projekt Red" }]);
    expect(node.publisher).toEqual([{ "@type": "Organization", name: "CD Projekt" }]);
    expect(node.sameAs).toBe("https://thewitcher.com");
  });

  it("keeps a real release date", () => {
    expect(gameJsonLd(game, "/games/1942").datePublished).toBe("2015-05-19");
  });

  it("reports the year alone when the day is padding, not a date", () => {
    // Steam only publishes a localized display string, so its mapper pads the
    // year to January 1st; claiming that as a release day would be a fact the
    // catalogue never stated.
    expect(gameJsonLd({ ...game, releaseDate: "2015-01-01" }, "/games/1942").datePublished).toBe(
      "2015"
    );
  });

  it("falls back through the store art Steam actually serves", () => {
    expect(gameJsonLd({ ...game, posterPath: null }, "/games/1942").image).toBe(
      "https://cdn/fallback.jpg"
    );
  });

  it("stays silent about the rating on the Steam fallback, which counts nothing", () => {
    // Metacritic arrives as a bare number; IGDB is the source that reports how
    // many ratings it averaged.
    const node = gameJsonLd({ ...game, ratingCount: undefined }, "/games/1942");
    expect(node).not.toHaveProperty("aggregateRating");
  });
});

describe("channelJsonLd", () => {
  it("points url at the channel and mainEntityOfPage at our page", () => {
    const node = channelJsonLd(channel, "/youtube/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw");
    expect(node["@type"]).toBe("Organization");
    expect(node.url).toBe("https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw");
    expect(node.mainEntityOfPage).toBe(
      "https://tierlistonline.com/youtube/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw"
    );
    expect(node.sameAs).toEqual(["https://www.youtube.com/@GoogleDevelopers"]);
  });

  it("counts subscribers as an interaction", () => {
    expect(channelJsonLd(channel, "/x").interactionStatistic).toEqual({
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/SubscribeAction",
      userInteractionCount: 2410000,
    });
  });

  it("says nothing about subscribers when the channel hides the count", () => {
    expect(channelJsonLd({ ...channel, subscriberCount: null }, "/x")).not.toHaveProperty(
      "interactionStatistic"
    );
  });
});

describe("itemListJsonLd", () => {
  const list = itemListJsonLd(
    [
      { type: "Movie", name: "Inception", path: "/title/movie-27205" },
      { type: "TVSeries", name: "Breaking Bad", path: "/title/tv-1396" },
    ],
    "/discover",
    "Popular films and TV shows"
  );

  it("numbers the entries from one", () => {
    const elements = list.itemListElement as Array<Record<string, unknown>>;
    expect(elements.map((entry) => entry.position)).toEqual([1, 2]);
    expect(list.numberOfItems).toBe(2);
  });

  it("stops at a page's worth, however long the listing was", () => {
    // YouTube discovery answers with a couple of hundred channels; all of them
    // would ship as JSON in the page.
    const long = itemListJsonLd(
      Array.from({ length: 258 }, (_, i) => ({ type: "Organization", name: `#${i}`, path: `/c/${i}` })),
      "/youtube",
      "Popular YouTube channels"
    );
    expect((long.itemListElement as unknown[]).length).toBe(MAX_LIST_ITEMS);
    expect(long.numberOfItems).toBe(MAX_LIST_ITEMS);
  });

  it("links each entry absolutely, under its own type", () => {
    const [first] = list.itemListElement as Array<{ item: Record<string, unknown> }>;
    expect(first.item).toEqual({
      "@type": "Movie",
      name: "Inception",
      url: "https://tierlistonline.com/title/movie-27205",
    });
  });
});

describe("jsonLdScript", () => {
  it("is parseable back into the same object", () => {
    expect(JSON.parse(jsonLdScript(titleJsonLd(movie, "/x")))).toEqual(titleJsonLd(movie, "/x"));
  });

  it("cannot close the script tag it sits in", () => {
    // A catalogue title is upstream text; one containing "</script>" would end
    // the element early and spill the rest of the payload into the document.
    const script = jsonLdScript(titleJsonLd({ ...movie, title: "</script><b>x" }, "/x"));
    expect(script).not.toContain("</script>");
    expect(JSON.parse(script).name).toBe("</script><b>x");
  });
});
