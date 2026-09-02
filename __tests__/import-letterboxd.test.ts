import { describe, expect, it } from "vitest";
import {
  letterboxdRatingToTier,
  mapRatingToTier,
  type ScaleTierMap,
} from "@/lib/import/tier-mapping";
import { LetterboxdImportError, parseLetterboxdRatings } from "@/lib/import/letterboxd";

describe("letterboxdRatingToTier", () => {
  it.each([
    [5.0, "S"],
    [4.5, "S"],
    [4.0, "A"],
    [3.5, "A"],
    [3.0, "B"],
    [2.5, "C"],
    [2.0, "D"],
    [1.5, "D"],
    [1.0, "F"],
    [0.5, "F"],
  ] as const)("maps %s stars to %s", (rating, tier) => {
    expect(letterboxdRatingToTier(rating)).toBe(tier);
  });
});

describe("mapRatingToTier — the generic mapper future sources reuse", () => {
  const scale: ScaleTierMap = [
    { value: 90, tier: "S" },
    { value: 70, tier: "A" },
    { value: 50, tier: "B" },
    { value: 30, tier: "C" },
    { value: 10, tier: "D" },
    { value: 0, tier: "F" },
  ];

  it("picks the highest defined step at or below the rating", () => {
    expect(mapRatingToTier(95, scale)).toBe("S");
    expect(mapRatingToTier(72, scale)).toBe("A");
    expect(mapRatingToTier(50, scale)).toBe("B");
  });

  it("falls to the worst tier for a rating below every defined step, rather than throwing", () => {
    expect(mapRatingToTier(-5, scale)).toBe("F");
  });
});

const HEADER = "Date,Name,Year,Letterboxd URI,Rating\n";

describe("parseLetterboxdRatings", () => {
  it("reads title, year, rating and the source link from a real-shaped row", () => {
    const rows = parseLetterboxdRatings(
      HEADER + "2024-03-01,Heat,1995,https://boxd.it/abc,4.5\n"
    );
    expect(rows).toEqual([
      { title: "Heat", year: 1995, rating: 4.5, sourceUrl: "https://boxd.it/abc" },
    ]);
  });

  it("handles a title containing a literal comma, correctly quoted by the exporter", () => {
    const rows = parseLetterboxdRatings(
      HEADER + '2024-03-01,"Paris, Texas",1984,https://boxd.it/xyz,5\n'
    );
    expect(rows[0].title).toBe("Paris, Texas");
  });

  it("skips a row with no rating — ratings.csv should not have one, but a hand-edited file might", () => {
    const rows = parseLetterboxdRatings(HEADER + "2024-03-01,Heat,1995,https://boxd.it/abc,\n");
    expect(rows).toEqual([]);
  });

  it("skips a row with no title", () => {
    const rows = parseLetterboxdRatings(HEADER + "2024-03-01,,1995,https://boxd.it/abc,4\n");
    expect(rows).toEqual([]);
  });

  it("treats a missing or unparsable year as null rather than dropping the row", () => {
    const rows = parseLetterboxdRatings(HEADER + "2024-03-01,Heat,,https://boxd.it/abc,4.5\n");
    expect(rows).toEqual([
      { title: "Heat", year: null, rating: 4.5, sourceUrl: "https://boxd.it/abc" },
    ]);
  });

  it("rejects a file that plainly is not a ratings export", () => {
    // watched.csv's own shape — no "Name" column at all, easy to hand this
    // file to the importer by mistake since it comes from the same export.
    expect(() => parseLetterboxdRatings("Date,Letterboxd URI\n2024-01-01,https://boxd.it/abc\n")).toThrow(
      LetterboxdImportError
    );
  });

  it("reads column order that has moved, since columns are matched by name not position", () => {
    const rows = parseLetterboxdRatings(
      "Rating,Name,Year,Date,Letterboxd URI\n4.5,Heat,1995,2024-03-01,https://boxd.it/abc\n"
    );
    expect(rows).toEqual([
      { title: "Heat", year: 1995, rating: 4.5, sourceUrl: "https://boxd.it/abc" },
    ]);
  });
});
