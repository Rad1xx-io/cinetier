/**
 * A small RFC 4180 CSV reader — not Letterboxd-specific.
 *
 * Written rather than pulled in as a dependency because the format is small
 * and well specified, and getting it right is what actually matters: a naive
 * `line.split(",")` breaks the moment a title contains a literal comma
 * ("Paris, Texas" is a real film, not a parsing edge case), and Letterboxd
 * quotes exactly those fields the way the spec expects.
 */

/**
 * One row's cells, quote-aware.
 *
 * Handles: quoted fields, a comma inside a quoted field, a doubled `""`
 * inside a quoted field as a literal `"`, and a newline inside a quoted
 * field (rare in a ratings export, but a review or a title with a line
 * break in it is not impossible, and this is cheap to get right once).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalised once so the loop below only ever sees "\n".
  const input = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // The file's last row has no trailing newline to end it.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // A trailing blank line is common (most exporters end the file with one)
  // and is not a row — an empty row would otherwise show up as "0 columns"
  // to every caller that expects a fixed column count.
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/**
 * Rows as objects keyed by the header line, the shape every caller actually
 * wants. Column order in the source file is never assumed beyond "the first
 * row names the columns" — Letterboxd has changed column order across export
 * format revisions before, and reading by name rather than position survives
 * that for free.
 */
export function parseCsvWithHeader(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const [header, ...body] = rows;
  return body.map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = row[index] ?? "";
    });
    return record;
  });
}
