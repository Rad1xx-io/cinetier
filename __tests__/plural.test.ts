import { describe, expect, it } from "vitest";
import { plural, titlesCountLabel } from "@/lib/utils/plural";

describe("plural", () => {
  it("keeps the singular at exactly one", () => {
    expect(plural(1, "title")).toBe("title");
  });

  it("pluralises everything else, zero included", () => {
    expect(plural(0, "title")).toBe("titles");
    expect(plural(2, "title")).toBe("titles");
    expect(plural(21, "title")).toBe("titles");
  });

  it("takes an irregular plural when -s will not do", () => {
    expect(plural(1, "entry", "entries")).toBe("entry");
    expect(plural(3, "entry", "entries")).toBe("entries");
  });

  it("reads the magnitude, not the sign", () => {
    expect(plural(-1, "title")).toBe("title");
    expect(plural(-4, "title")).toBe("titles");
  });
});

describe("titlesCountLabel", () => {
  it("puts the count in front of the noun", () => {
    expect(titlesCountLabel(1)).toBe("1 title");
    expect(titlesCountLabel(0)).toBe("0 titles");
    expect(titlesCountLabel(42)).toBe("42 titles");
  });
});
