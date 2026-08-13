import { describe, expect, it } from "vitest";
import {
  applyAliases,
  expandQueryVariants,
  hasCyrillic,
  transliterate,
} from "@/lib/games/query-variants";

describe("hasCyrillic", () => {
  it("spots Cyrillic anywhere in the query", () => {
    expect(hasCyrillic("дота 2")).toBe(true);
    expect(hasCyrillic("Ведьмак")).toBe(true);
    expect(hasCyrillic("elden ring")).toBe(false);
    expect(hasCyrillic("Portal 2")).toBe(false);
  });
});

describe("transliterate", () => {
  it("turns a Cyrillic title into the Latin spelling Steam indexes", () => {
    expect(transliterate("дота")).toBe("dota");
    expect(transliterate("елден ринг")).toBe("elden ring");
    expect(transliterate("портал")).toBe("portal");
  });

  it("leaves digits and Latin characters alone", () => {
    expect(transliterate("дота 2")).toBe("dota 2");
  });
});

describe("applyAliases", () => {
  it("maps names transliteration would mangle", () => {
    // "майнкрафт" transliterates to "maynkraft", which Steam does not index.
    expect(applyAliases("майнкрафт")).toBe("minecraft");
  });

  it("prefers the longest matching phrase", () => {
    expect(applyAliases("кс го")).toBe("counter-strike");
    expect(applyAliases("мир танков")).toBe("world of tanks");
  });

  it("keeps the rest of the query around the alias", () => {
    expect(applyAliases("дота 2")).toBe("dota 2");
  });

  it("does not fire inside a longer Cyrillic word", () => {
    // "кс" must not match within "риск"; the query is left untouched.
    expect(applyAliases("риск")).toBe("риск");
  });
});

describe("expandQueryVariants", () => {
  it("passes Latin queries through untouched", () => {
    expect(expandQueryVariants("elden ring")).toEqual(["elden ring"]);
  });

  it("keeps the original Russian query first — Steam localizes some titles", () => {
    // "ведьмак" genuinely matches «Ведьмак 3: Дикая Охота» on Steam, so the
    // original must survive alongside the English variant.
    const variants = expandQueryVariants("ведьмак");
    expect(variants[0]).toBe("ведьмак");
    expect(variants).toContain("witcher");
  });

  it("adds a searchable variant for a query Steam cannot match", () => {
    expect(expandQueryVariants("дота 2")).toEqual(["дота 2", "dota 2"]);
  });

  it("covers abbreviations", () => {
    expect(expandQueryVariants("кс го")).toContain("counter-strike");
  });

  it("transliterates when no alias applies", () => {
    expect(expandQueryVariants("елден ринг")).toContain("elden ring");
  });

  it("returns nothing for an empty query", () => {
    expect(expandQueryVariants("   ")).toEqual([]);
  });

  it("never repeats a variant", () => {
    const variants = expandQueryVariants("портал");
    expect(new Set(variants).size).toBe(variants.length);
  });
});
