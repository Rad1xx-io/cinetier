import { describe, expect, it } from "vitest";
import {
  parseWatchProviders,
  providersToAffiliateLinks,
  type WatchProviders,
} from "@/lib/services/watch-providers";

/** Shaped after a real /watch/providers response, trimmed to what is used. */
const payload = {
  id: 27205,
  results: {
    US: {
      link: "https://www.themoviedb.org/movie/27205-inception/watch?locale=US",
      flatrate: [
        {
          provider_id: 8,
          provider_name: "Netflix",
          logo_path: "/net.jpg",
          display_priority: 3,
        },
        {
          provider_id: 257,
          provider_name: "fuboTV",
          logo_path: "/fubo.jpg",
          display_priority: 10,
        },
      ],
      rent: [
        {
          provider_id: 10,
          provider_name: "Amazon Video",
          logo_path: "/amz.jpg",
          display_priority: 8,
        },
      ],
      buy: [
        {
          provider_id: 10,
          provider_name: "Amazon Video",
          logo_path: "/amz.jpg",
          display_priority: 8,
        },
      ],
    },
    GB: { link: "https://www.themoviedb.org/movie/27205/watch?locale=GB" },
  },
};

describe("parseWatchProviders", () => {
  it("reads the requested region", () => {
    const result = parseWatchProviders(payload, "US");
    expect(result?.region).toBe("US");
    expect(result?.link).toBe("https://www.themoviedb.org/movie/27205-inception/watch?locale=US");
  });

  it("accepts a lowercase region code", () => {
    expect(parseWatchProviders(payload, "us")?.region).toBe("US");
  });

  // TMDB has no RU data at all — JustWatch, its source, does not cover Russia.
  // An absent region is ordinary, not an error.
  it("returns null for a region with no data", () => {
    expect(parseWatchProviders(payload, "RU")).toBeNull();
  });

  it("returns null for an empty or malformed payload", () => {
    expect(parseWatchProviders(null, "US")).toBeNull();
    expect(parseWatchProviders(undefined, "US")).toBeNull();
    expect(parseWatchProviders({}, "US")).toBeNull();
    expect(parseWatchProviders({ results: {} }, "US")).toBeNull();
  });

  it("keeps a region that offers only a link", () => {
    const result = parseWatchProviders(payload, "GB");
    expect(result?.providers).toEqual([]);
    expect(result?.link).toContain("locale=GB");
  });

  it("lists a service once, under the best offer it makes", () => {
    const result = parseWatchProviders(payload, "US");
    const amazon = result?.providers.filter((p) => p.providerId === 10) ?? [];
    expect(amazon).toHaveLength(1);
    // Present in both rent and buy; rent is the better offer and wins.
    expect(amazon[0].kind).toBe("rent");
  });

  it("puts subscriptions before rentals, and orders within a kind by priority", () => {
    const result = parseWatchProviders(payload, "US");
    expect(result?.providers.map((p) => p.name)).toEqual(["Netflix", "fuboTV", "Amazon Video"]);
  });

  it("skips entries missing an id or a name", () => {
    const broken = {
      results: {
        US: {
          link: "https://www.themoviedb.org/movie/1/watch",
          flatrate: [
            { provider_name: "No Id" },
            { provider_id: 8 },
            { provider_id: 9, provider_name: "   " },
            { provider_id: 8, provider_name: "Netflix" },
          ],
        },
      },
    };
    expect(parseWatchProviders(broken, "US")?.providers.map((p) => p.name)).toEqual(["Netflix"]);
  });
});

describe("providersToAffiliateLinks", () => {
  const providers = parseWatchProviders(payload, "US") as WatchProviders;

  it("builds a search link per service it knows", () => {
    const links = providersToAffiliateLinks(providers, "Начало");
    expect(links.netflix).toBe("https://www.netflix.com/search?q=%D0%9D%D0%B0%D1%87%D0%B0%D0%BB%D0%BE");
    expect(links.amazon).toContain("https://www.amazon.com/s?k=");
  });

  it("includes TMDB's own watch page", () => {
    const links = providersToAffiliateLinks(providers, "Начало");
    expect(links.tmdb).toBe("https://www.themoviedb.org/movie/27205-inception/watch?locale=US");
  });

  // fuboTV is real availability, but there is no template for it and no way to
  // derive one — leaving it out beats inventing a destination.
  it("leaves out a service with no search template", () => {
    const links = providersToAffiliateLinks(providers, "Начало");
    expect(Object.keys(links)).not.toContain("fubotv");
  });

  it("returns nothing when there is no availability", () => {
    expect(providersToAffiliateLinks(null, "Начало")).toEqual({});
    expect(providersToAffiliateLinks(undefined, "Начало")).toEqual({});
  });

  it("escapes a title that would otherwise break the query", () => {
    const links = providersToAffiliateLinks(providers, "Tom & Jerry?");
    expect(links.netflix).toBe("https://www.netflix.com/search?q=Tom%20%26%20Jerry%3F");
  });
});
