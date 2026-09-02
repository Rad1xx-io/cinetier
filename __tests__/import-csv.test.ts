import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvWithHeader } from "@/lib/import/csv";

describe("parseCsv", () => {
  it("splits a plain row on commas", () => {
    expect(parseCsv("a,b,c")).toEqual([["a", "b", "c"]]);
  });

  it("does not split a comma inside a quoted field — Paris, Texas is one field", () => {
    expect(parseCsv('2023-01-01,"Paris, Texas",1984')).toEqual([
      ["2023-01-01", "Paris, Texas", "1984"],
    ]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    expect(parseCsv('"She said ""hello"""')).toEqual([['She said "hello"']]);
  });

  it("keeps a newline inside a quoted field as part of the field, not a new row", () => {
    expect(parseCsv('"line one\nline two",b')).toEqual([["line one\nline two", "b"]]);
  });

  it("reads multiple rows, CRLF included", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("does not manufacture a row from a trailing blank line", () => {
    expect(parseCsv("a,b\n")).toEqual([["a", "b"]]);
  });

  it("handles a file with no trailing newline at all", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("parseCsvWithHeader", () => {
  it("keys each row by the header row, not by column position", () => {
    const records = parseCsvWithHeader("Name,Year,Rating\nHeat,1995,4.5\n");
    expect(records).toEqual([{ Name: "Heat", Year: "1995", Rating: "4.5" }]);
  });

  it("returns an empty array for an empty file", () => {
    expect(parseCsvWithHeader("")).toEqual([]);
  });

  it("survives a row shorter than the header — a trailing blank field cut off by the exporter", () => {
    const records = parseCsvWithHeader("Name,Year,Rating\nHeat,1995\n");
    expect(records).toEqual([{ Name: "Heat", Year: "1995", Rating: "" }]);
  });
});
