import { describe, expect, it } from "vitest";
import {
  boundedCount,
  boundedPage,
  boundedPageToken,
  boundedRegion,
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
