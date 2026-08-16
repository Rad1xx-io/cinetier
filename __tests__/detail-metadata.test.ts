import { describe, expect, it } from "vitest";
import type { Metadata } from "next";
import {
  DESCRIPTION_LIMIT,
  detailMetadata,
  fallbackDescription,
  truncateDescription,
} from "@/lib/seo/detail-metadata";

describe("truncateDescription", () => {
  it("leaves a short blurb alone", () => {
    expect(truncateDescription("A dream within a dream.")).toBe("A dream within a dream.");
  });

  it("collapses the whitespace catalogues leave in their prose", () => {
    // AniList descriptions arrive with stray newlines from stripped <br> tags.
    expect(truncateDescription("Two\n\nlines   here")).toBe("Two lines here");
  });

  it("stays inside the limit", () => {
    const long = "word ".repeat(80);
    expect(truncateDescription(long).length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
  });

  it("cuts at a word rather than mid-syllable", () => {
    const long = `${"a".repeat(50)} ${"b".repeat(50)} ${"c".repeat(100)}`;
    const out = truncateDescription(long);
    expect(out.endsWith("…")).toBe(true);
    // Whatever survived is whole words plus the ellipsis.
    expect(out.slice(0, -1).trim().split(" ").every((w) => long.includes(w))).toBe(true);
  });

  it("still cuts when there is no space to cut at", () => {
    const out = truncateDescription("x".repeat(400));
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    expect(out.endsWith("…")).toBe(true);
  });

  it("does not leave punctuation stranded before the ellipsis", () => {
    const long = `${"word ".repeat(30)}end, ${"more ".repeat(20)}`;
    expect(truncateDescription(long)).not.toMatch(/[,;:.]…$/);
  });
});

describe("fallbackDescription", () => {
  it("names the title rather than describing the site", () => {
    // A result for an obscure film should say which film.
    expect(fallbackDescription("Dogville")).toContain("Dogville");
  });
});

describe("detailMetadata", () => {
  const base = { title: "Inception", path: "/title/movie-27205" };

  /** `Metadata["twitter"]` is a union; only some members carry `card`. */
  function twitterCard(meta: Metadata): string | undefined {
    return (meta.twitter as { card?: string } | undefined)?.card;
  }

  it("suffixes the title with the site name", () => {
    expect(detailMetadata(base).title).toBe("Inception — TierListOnline");
  });

  it("carries the same text into description, og and twitter", () => {
    const meta = detailMetadata({ ...base, description: "A thief who steals secrets." });
    expect(meta.description).toBe("A thief who steals secrets.");
    expect(meta.openGraph?.description).toBe(meta.description);
    expect(meta.twitter?.description).toBe(meta.description);
  });

  it("falls back when the catalogue gave no blurb", () => {
    for (const value of [undefined, null, "   "]) {
      expect(detailMetadata({ ...base, description: value }).description).toBe(
        fallbackDescription("Inception")
      );
    }
  });

  it("expands a TMDB path into a CDN url", () => {
    const meta = detailMetadata({ ...base, image: "/poster.jpg" });
    expect(meta.openGraph?.images).toEqual([
      { url: "https://image.tmdb.org/t/p/w500/poster.jpg", alt: "Inception" },
    ]);
  });

  it("passes an already absolute cover through untouched", () => {
    // AniList, Steam and YouTube all send full URLs.
    const meta = detailMetadata({ ...base, image: "https://s4.anilist.co/cover.jpg" });
    expect(meta.openGraph?.images).toEqual([
      { url: "https://s4.anilist.co/cover.jpg", alt: "Inception" },
    ]);
  });

  it("omits the image rather than faking one", () => {
    // A broken preview in a chat client looks worse than no preview.
    const meta = detailMetadata({ ...base, image: null });
    expect(meta.openGraph).not.toHaveProperty("images");
    expect(twitterCard(meta)).toBe("summary");
  });

  it("asks for the large card only when there is artwork to fill it", () => {
    expect(twitterCard(detailMetadata({ ...base, image: "/p.jpg" }))).toBe("summary_large_image");
  });

  it("points the canonical and og:url at the page itself", () => {
    const meta = detailMetadata(base);
    expect(meta.alternates?.canonical).toBe("/title/movie-27205");
    expect(meta.openGraph?.url).toBe("/title/movie-27205");
  });

  it("truncates a long blurb everywhere it appears", () => {
    const meta = detailMetadata({ ...base, description: "word ".repeat(100) });
    expect(String(meta.description).length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    expect(meta.openGraph?.description).toBe(meta.description);
  });
});
