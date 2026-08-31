import { describe, expect, it } from "vitest";
import {
  boundedChannelId,
  boundedCount,
  boundedExternalId,
  boundedFilterTerm,
  boundedPage,
  boundedPageToken,
  boundedRegion,
  MAX_EXTERNAL_ID,
  MAX_PAGE,
} from "@/lib/utils/request-bounds";

/**
 * The numbers a visitor can put in a query string, and what this server is
 * willing to forward upstream on the strength of them.
 *
 * `?page=999999999` used to reach IGDB verbatim. None of these is a security
 * boundary on its own — the rate limiter is — but each one is work an attacker
 * can ask this server to do for free, so each one has a ceiling.
 */

describe("boundedPage", () => {
  it("keeps an ordinary page", () => {
    expect(boundedPage("3")).toBe(3);
    expect(boundedPage(7)).toBe(7);
  });

  it("defaults to the first page for anything unparseable", () => {
    expect(boundedPage(null)).toBe(1);
    expect(boundedPage(undefined)).toBe(1);
    expect(boundedPage("")).toBe(1);
    expect(boundedPage("banana")).toBe(1);
    expect(boundedPage("NaN")).toBe(1);
    expect(boundedPage(Number.NaN)).toBe(1);
  });

  it("refuses to go below the first page", () => {
    expect(boundedPage("0")).toBe(1);
    expect(boundedPage("-5")).toBe(1);
    expect(boundedPage(-Infinity)).toBe(1);
  });

  it("caps the absurd values that were previously forwarded", () => {
    expect(boundedPage("999999999")).toBe(MAX_PAGE);
    expect(boundedPage(Infinity)).toBe(1);
    expect(boundedPage("1e30")).toBe(MAX_PAGE);
  });

  it("truncates a fractional page rather than passing it on", () => {
    expect(boundedPage("2.9")).toBe(2);
  });

  it("counts from zero for the upstreams that do", () => {
    expect(boundedPage("0", true)).toBe(0);
    expect(boundedPage("-1", true)).toBe(0);
    expect(boundedPage(null, true)).toBe(0);
    expect(boundedPage("999999999", true)).toBe(MAX_PAGE);
  });
});

describe("boundedCount", () => {
  it("keeps a sensible filter value", () => {
    expect(boundedCount("1000", 1_000_000)).toBe(1000);
  });

  it("floors anything negative or unparseable to zero", () => {
    expect(boundedCount("-1", 100)).toBe(0);
    expect(boundedCount("banana", 100)).toBe(0);
    expect(boundedCount(null, 100)).toBe(0);
    expect(boundedCount(Number.NaN, 100)).toBe(0);
  });

  it("caps at the ceiling it was given", () => {
    expect(boundedCount("999999999", 500)).toBe(500);
  });

  it("treats Infinity as no filter rather than as the ceiling", () => {
    // Unlike a page number, which has a sensible nearest value, "at least
    // Infinity subscribers" expresses nothing — so it joins NaN and "banana"
    // in meaning no filter at all, rather than being silently rounded down to
    // a specific threshold the caller never asked for.
    expect(boundedCount(Infinity, 500)).toBe(0);
  });
});

describe("boundedPageToken", () => {
  it("keeps a token-shaped value", () => {
    expect(boundedPageToken("CAoQAA")).toBe("CAoQAA");
    expect(boundedPageToken("A-b_c=.1")).toBe("A-b_c=.1");
  });

  it("drops anything that is not token-shaped", () => {
    // Forwarded verbatim to YouTube, so it is worth knowing it is a token and
    // not a sentence somebody typed.
    expect(boundedPageToken("../../etc/passwd")).toBeUndefined();
    expect(boundedPageToken("token with spaces")).toBeUndefined();
    expect(boundedPageToken("<script>")).toBeUndefined();
    expect(boundedPageToken("a".repeat(257))).toBeUndefined();
  });

  it("treats empty and missing as absent", () => {
    expect(boundedPageToken("")).toBeUndefined();
    expect(boundedPageToken(null)).toBeUndefined();
    expect(boundedPageToken("   ")).toBeUndefined();
  });
});

describe("boundedRegion", () => {
  it("accepts an ISO alpha-2 code, normalised", () => {
    expect(boundedRegion("us")).toBe("US");
    expect(boundedRegion(" GB ")).toBe("GB");
  });

  it("rejects anything else", () => {
    expect(boundedRegion("USA")).toBeUndefined();
    expect(boundedRegion("U")).toBeUndefined();
    expect(boundedRegion("12")).toBeUndefined();
    expect(boundedRegion(null)).toBeUndefined();
  });
});


describe("boundedExternalId", () => {
  it.each([
    ["a plain id", "27205", 27205],
    ["one", "1", 1],
    ["the ceiling itself", String(MAX_EXTERNAL_ID), MAX_EXTERNAL_ID],
  ])("accepts %s", (_name, input, expected) => {
    expect(boundedExternalId(input)).toBe(expected);
  });

  /*
   * Every one of these passed `Number.isFinite`, which is what the two details
   * routes used to check, and every one became an upstream request that could
   * only ever come back as an error paid for out of somebody's quota.
   */
  it.each([
    ["negative", "-1"],
    ["zero", "0"],
    ["fractional", "1.5"],
    ["exponent notation", "1e300"],
    ["hex", "0x1f"],
    ["past the ceiling", String(MAX_EXTERNAL_ID + 1)],
    ["beyond a safe integer", "99999999999999999999"],
    ["not a number at all", "abc"],
    ["a uuid", "11111111-1111-4111-8111-111111111111"],
    ["empty", ""],
    ["whitespace only", "   "],
    ["null", null],
    ["undefined", undefined],
    ["NaN spelled out", "NaN"],
    ["Infinity spelled out", "Infinity"],
  ])("refuses %s", (_name, input) => {
    expect(boundedExternalId(input)).toBeNull();
  });

  it("forgives surrounding whitespace — a sloppy caller, not a hostile one", () => {
    expect(boundedExternalId(" 12 ")).toBe(12);
  });

  it("refuses rather than clamping, because a different id is a different answer", () => {
    // A page number out of range has an obvious sensible substitute. An id
    // does not: somebody asking for film -1 has not asked for film 1.
    expect(boundedExternalId("-1")).toBeNull();
    expect(boundedExternalId(String(MAX_EXTERNAL_ID + 1))).toBeNull();
  });
});

describe("boundedChannelId", () => {
  it("accepts a real channel id", () => {
    expect(boundedChannelId("UCXuqSBlHAE6Xw-yeJA0Tunw")).toBe("UCXuqSBlHAE6Xw-yeJA0Tunw");
  });

  it("trims surrounding whitespace", () => {
    expect(boundedChannelId("  UCXuqSBlHAE6Xw-yeJA0Tunw  ")).toBe("UCXuqSBlHAE6Xw-yeJA0Tunw");
  });

  /*
   * `channels.list` takes up to fifty comma-separated ids and this value was
   * forwarded verbatim. The route only ever reads items[0], so a batch was
   * never useful to anyone except somebody widening the request this server
   * makes on their say-so.
   */
  it("refuses a comma-separated batch", () => {
    expect(boundedChannelId("UCXuqSBlHAE6Xw-yeJA0Tunw,UCXuqSBlHAE6Xw-yeJA0Tunx")).toBeNull();
  });

  it.each([
    ["an over-long string", "UC" + "a".repeat(500)],
    ["too short", "UCshort"],
    ["missing the UC prefix", "XXXuqSBlHAE6Xw-yeJA0Tunw"],
    ["a query fragment", "UCXuqSBlHAE6Xw-yeJA0Tunw&part=snippet"],
    ["a url", "https://youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw"],
    ["empty", ""],
    ["null", null],
  ])("refuses %s", (_name, input) => {
    expect(boundedChannelId(input)).toBeNull();
  });
});

describe("boundedFilterTerm", () => {
  it("keeps an ordinary genre name", () => {
    expect(boundedFilterTerm("Science Fiction")).toBe("Science Fiction");
  });

  it("caps a long value rather than carrying it upstream", () => {
    expect(boundedFilterTerm("g".repeat(500))?.length).toBe(60);
  });

  it("honours a caller-supplied ceiling", () => {
    expect(boundedFilterTerm("g".repeat(500), 10)?.length).toBe(10);
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["null", null],
    ["undefined", undefined],
  ])("returns undefined for %s", (_name, input) => {
    expect(boundedFilterTerm(input)).toBeUndefined();
  });
});
