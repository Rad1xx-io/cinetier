import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractRatingsCsv, readLetterboxdRatingsFile, LetterboxdImportError } from "@/lib/import/letterboxd";

const RATINGS_CSV = "Date,Name,Year,Letterboxd URI,Rating\n2024-03-01,Heat,1995,https://boxd.it/abc,4.5\n";

async function zipFile(entries: Record<string, string>): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], "letterboxd-export.zip", { type: "application/zip" });
}

/*
 * The real shape of a Letterboxd export: one zip, half a dozen CSVs
 * (watched, diary, watchlist, reviews, ratings, comments…), because that's
 * what "click Export" actually produces — asking someone to find and
 * extract one specific file from it first is the friction this exists to
 * remove.
 */
describe("extractRatingsCsv", () => {
  it("finds ratings.csv alongside the export's other files and ignores the rest", async () => {
    const file = await zipFile({
      "watched.csv": "Date,Name,Year\n",
      "ratings.csv": RATINGS_CSV,
      "watchlist.csv": "Date,Name,Year\n",
    });

    const text = await extractRatingsCsv(file);
    expect(text).toBe(RATINGS_CSV);
  });

  it("finds it nested under a folder, the way some export tools lay a zip out", async () => {
    const file = await zipFile({ "letterboxd-export/ratings.csv": RATINGS_CSV });
    expect(await extractRatingsCsv(file)).toBe(RATINGS_CSV);
  });

  it("rejects a zip that has no ratings.csv in it at all", async () => {
    const file = await zipFile({ "watched.csv": "Date,Name,Year\n" });
    await expect(extractRatingsCsv(file)).rejects.toThrow(LetterboxdImportError);
  });
});

describe("readLetterboxdRatingsFile", () => {
  it("unzips a .zip", async () => {
    const file = await zipFile({ "ratings.csv": RATINGS_CSV });
    expect(await readLetterboxdRatingsFile(file)).toBe(RATINGS_CSV);
  });

  it("reads a bare .csv as-is, without touching the zip path", async () => {
    const file = new File([RATINGS_CSV], "ratings.csv", { type: "text/csv" });
    expect(await readLetterboxdRatingsFile(file)).toBe(RATINGS_CSV);
  });
});
