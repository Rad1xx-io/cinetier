import { parseCsvWithHeader } from "@/lib/import/csv";
import type { ImportRow } from "@/lib/import/types";

export class LetterboxdImportError extends Error {}

/**
 * `Settings → Data → Export` on Letterboxd. The file that matters is
 * `ratings.csv` — `Date, Name, Year, Letterboxd URI, Rating`, one row per
 * film the account has rated (an unrated watch does not appear here at
 * all, which is why nothing in this pipeline ever produces "Unrated").
 *
 * Read by column name, not position — this survives Letterboxd reordering
 * columns across an export format revision, which vertical-position-based
 * parsing would not.
 */
export function parseLetterboxdRatings(csvText: string): ImportRow[] {
  const records = parseCsvWithHeader(csvText);

  const hasExpectedColumns = records.length === 0 || "Name" in records[0];
  if (!hasExpectedColumns) {
    throw new LetterboxdImportError(
      "That doesn't look like a Letterboxd ratings export — expected a “Name” column."
    );
  }

  const rows: ImportRow[] = [];
  for (const record of records) {
    const title = record["Name"]?.trim();
    const rating = Number.parseFloat(record["Rating"] ?? "");
    if (!title || !Number.isFinite(rating)) continue;

    const yearRaw = record["Year"]?.trim();
    const year = yearRaw ? Number.parseInt(yearRaw, 10) : null;

    rows.push({
      title,
      year: Number.isFinite(year as number) ? year : null,
      rating,
      sourceUrl: record["Letterboxd URI"]?.trim() || null,
    });
  }
  return rows;
}

/** `ratings.csv`, whatever depth it sits at inside the export zip. */
const RATINGS_CSV_PATTERN = /(^|\/)ratings\.csv$/i;

/**
 * The whole export zip in, `ratings.csv` out.
 *
 * Letterboxd's export is one zip holding half a dozen CSVs — watched,
 * diary, watchlist, reviews, ratings, and more — because the file a person
 * actually has after clicking Export is that zip, not any one CSV plucked
 * out of it by hand. Asking them to open an archive manager and hunt down
 * one specific file first is friction this can absorb instead: unzip
 * in the browser, find the one file this cares about, ignore the rest.
 *
 * `JSZip` is loaded lazily so the ordinary "I already have the CSV" path —
 * still supported, still the faster one for anyone who already extracted
 * it — never pays to parse zip-reading code it does not use.
 */
export async function extractRatingsCsv(file: File): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);

  const entry = Object.values(zip.files).find(
    (f) => !f.dir && RATINGS_CSV_PATTERN.test(f.name)
  );
  if (!entry) {
    throw new LetterboxdImportError(
      "This zip doesn't contain a ratings.csv — check it's the export from Settings → Data → Export."
    );
  }
  return entry.async("string");
}

/** Whichever of "just the CSV" or "the whole export zip" was handed over. */
export async function readLetterboxdRatingsFile(file: File): Promise<string> {
  const isZip = file.name.toLowerCase().endsWith(".zip");
  return isZip ? extractRatingsCsv(file) : file.text();
}
