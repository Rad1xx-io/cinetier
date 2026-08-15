import { describe, expect, it } from "vitest";
import {
  affiliateLinkList,
  attachAffiliateParams,
  providerFromTmdbName,
  safeAffiliateUrl,
} from "@/lib/utils/affiliate-url";

describe("safeAffiliateUrl", () => {
  it("keeps a link that matches its provider", () => {
    expect(safeAffiliateUrl("kinopoisk", "https://www.kinopoisk.ru/film/361")).toBe(
      "https://www.kinopoisk.ru/film/361"
    );
    expect(safeAffiliateUrl("netflix", "https://www.netflix.com/title/70131314")).toBe(
      "https://www.netflix.com/title/70131314"
    );
  });

  it("accepts a subdomain of the provider", () => {
    expect(safeAffiliateUrl("kinopoisk", "https://hd.kinopoisk.ru/film/361")).toBe(
      "https://hd.kinopoisk.ru/film/361"
    );
  });

  // The reason the host list exists: the label is a claim, and an outbound link
  // that earns money is exactly what somebody would want to point elsewhere.
  it("rejects a link whose host does not belong to the brand it claims", () => {
    expect(safeAffiliateUrl("netflix", "https://evil.com/watch")).toBeNull();
    expect(safeAffiliateUrl("kinopoisk", "https://ivi.ru/watch")).toBeNull();
  });

  it("rejects a lookalike host that merely contains the real one", () => {
    expect(safeAffiliateUrl("netflix", "https://netflix.com.evil.com/x")).toBeNull();
    expect(safeAffiliateUrl("ivi", "https://notivi.ru/x")).toBeNull();
  });

  it("rejects executable schemes whatever the provider", () => {
    expect(safeAffiliateUrl("kinopoisk", "javascript:alert(1)")).toBeNull();
    expect(safeAffiliateUrl("unknown", "javascript:alert(1)")).toBeNull();
    expect(safeAffiliateUrl("unknown", "data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeAffiliateUrl("unknown", "file:///etc/passwd")).toBeNull();
  });

  it("only requires a real link for an id with no brand to misrepresent", () => {
    expect(safeAffiliateUrl("someshop", "https://example.com/watch")).toBe(
      "https://example.com/watch"
    );
  });

  it("adds https to a link stored without a scheme", () => {
    expect(safeAffiliateUrl("okko", "okko.tv/movie/x")).toBe("https://okko.tv/movie/x");
  });

  it("treats blank input as absent", () => {
    expect(safeAffiliateUrl("ivi", null)).toBeNull();
    expect(safeAffiliateUrl("ivi", undefined)).toBeNull();
    expect(safeAffiliateUrl("ivi", "   ")).toBeNull();
    expect(safeAffiliateUrl("ivi", "not a url")).toBeNull();
  });
});

describe("affiliateLinkList", () => {
  it("returns nothing for an absent or empty record", () => {
    expect(affiliateLinkList(undefined)).toEqual([]);
    expect(affiliateLinkList(null)).toEqual([]);
    expect(affiliateLinkList({})).toEqual([]);
  });

  it("labels known services by name", () => {
    const list = affiliateLinkList({ kinopoisk: "https://kinopoisk.ru/film/1" });
    expect(list).toEqual([
      {
        providerId: "kinopoisk",
        label: "Кинопоиск",
        url: "https://kinopoisk.ru/film/1",
        known: true,
      },
    ]);
  });

  it("orders by the registry, not by how the record was written", () => {
    const list = affiliateLinkList({
      netflix: "https://netflix.com/title/1",
      kinopoisk: "https://kinopoisk.ru/film/1",
      ivi: "https://ivi.ru/watch/1",
    });
    expect(list.map((l) => l.providerId)).toEqual(["kinopoisk", "ivi", "netflix"]);
  });

  it("drops only the invalid entries, keeping the rest", () => {
    const list = affiliateLinkList({
      kinopoisk: "https://kinopoisk.ru/film/1",
      netflix: "https://evil.com/phish",
      ivi: "javascript:alert(1)",
    });
    expect(list.map((l) => l.providerId)).toEqual(["kinopoisk"]);
  });

  it("names an unknown service after the host it actually opens", () => {
    const list = affiliateLinkList({ someshop: "https://www.example.com/watch" });
    expect(list).toEqual([
      {
        providerId: "someshop",
        label: "example.com",
        url: "https://www.example.com/watch",
        known: false,
      },
    ]);
  });

  it("lists known services before unknown ones", () => {
    const list = affiliateLinkList({
      someshop: "https://example.com/x",
      okko: "https://okko.tv/x",
    });
    expect(list.map((l) => l.providerId)).toEqual(["okko", "someshop"]);
  });
});

describe("providerFromTmdbName", () => {
  it("resolves the spellings TMDB actually uses", () => {
    expect(providerFromTmdbName("Amazon Video")?.id).toBe("amazon");
    expect(providerFromTmdbName("Amazon Prime Video")?.id).toBe("amazon");
    expect(providerFromTmdbName("Netflix")?.id).toBe("netflix");
    expect(providerFromTmdbName("  netflix  ")?.id).toBe("netflix");
  });

  it("is null for a service the registry does not carry", () => {
    expect(providerFromTmdbName("fuboTV")).toBeNull();
  });
});

describe("attachAffiliateParams", () => {
  it("returns the link untouched when no partner id is configured", () => {
    // No NEXT_PUBLIC_*_AFFILIATE_ID is set in the test environment, which is
    // also the normal state before any programme is joined: links must still work.
    expect(attachAffiliateParams("kinopoisk", "https://kinopoisk.ru/film/1")).toBe(
      "https://kinopoisk.ru/film/1"
    );
    expect(attachAffiliateParams("okko", "https://okko.tv/search/x")).toBe(
      "https://okko.tv/search/x"
    );
  });

  it("returns the link untouched for a service with no programme", () => {
    expect(attachAffiliateParams("netflix", "https://netflix.com/search?q=x")).toBe(
      "https://netflix.com/search?q=x"
    );
  });

  it("returns the link untouched for an unknown service", () => {
    expect(attachAffiliateParams("nope", "https://example.com/x")).toBe("https://example.com/x");
  });

  it("hands back a value it cannot parse rather than dropping it", () => {
    expect(attachAffiliateParams("kinopoisk", "not a url")).toBe("not a url");
  });
});
