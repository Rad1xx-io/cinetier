import { describe, expect, it, vi } from "vitest";
import { searchWithFallback, MIN_RESULTS_BEFORE_FALLBACK } from "@/lib/search/with-fallback";
import { sentenceCase } from "@/lib/search/normalize-query";

/** Stands in for a catalogue: answers only the exact terms it was given. */
function catalogue(byTerm: Record<string, string[]>) {
  return vi.fn(async (term: string) => byTerm[term] ?? []);
}

const keyOf = (item: string) => item;
const enough = ["a", "b", "c", "d"];

describe("sentenceCase", () => {
  it("raises the first letter and leaves the rest alone", () => {
    expect(sentenceCase("твоя апрельская ложь")).toBe("Твоя апрельская ложь");
  });

  it("does not touch a word that is already capitalised", () => {
    expect(sentenceCase("Наруто")).toBe("Наруто");
  });

  it("leaves inner capitals as they are — AniList wants sentence case, not title case", () => {
    expect(sentenceCase("твоя Апрельская ложь")).toBe("Твоя Апрельская ложь");
  });

  it("survives an empty or blank value", () => {
    expect(sentenceCase("")).toBe("");
    expect(sentenceCase("   ")).toBe("");
  });
});

describe("searchWithFallback — without extras", () => {
  it("returns the original's results when they are plentiful", async () => {
    const run = catalogue({ naruto: enough });
    const { results, correctedQuery } = await searchWithFallback("naruto", run, keyOf);

    expect(results).toEqual(enough);
    expect(correctedQuery).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });

  // The other catalogues pass no options; their chain must be exactly as before.
  it("still reaches for the normalizer's own variants", async () => {
    const run = catalogue({ "death note": enough });
    const { results, correctedQuery } = await searchWithFallback("тетрадь смерти", run, keyOf);

    expect(results).toEqual(enough);
    expect(correctedQuery).toBe("death note");
  });
});

describe("searchWithFallback — extra variants", () => {
  // The whole point: AniList stores Russian synonyms in sentence case and
  // matches nothing else, while nobody types the capital.
  it("tries a variant that differs from the original only in case", async () => {
    const run = catalogue({ "Твоя апрельская ложь": ["Your lie in April"] });

    const { results } = await searchWithFallback("твоя апрельская ложь", run, keyOf, {
      extraVariants: (term) => [sentenceCase(term)],
    });

    expect(results).toEqual(["Your lie in April"]);
    expect(run).toHaveBeenCalledWith("Твоя апрельская ложь");
  });

  it("does not drop that variant as a duplicate of the original", async () => {
    const run = catalogue({});
    await searchWithFallback("атака титанов", run, keyOf, {
      extraVariants: (term) => [sentenceCase(term)],
    });

    const tried = run.mock.calls.map(([term]) => term);
    expect(tried).toContain("атака титанов");
    expect(tried).toContain("Атака титанов");
  });

  it("tries the extra before the normalizer's transliteration", async () => {
    const run = catalogue({});
    await searchWithFallback("атака титанов", run, keyOf, {
      extraVariants: (term) => [sentenceCase(term)],
    });

    const tried = run.mock.calls.map(([term]) => term);
    // A source-specific quirk explains a thin result more often than a typo.
    expect(tried.indexOf("Атака титанов")).toBeLessThan(tried.indexOf("ataka titanov"));
  });

  it("never runs the same term twice", async () => {
    const run = catalogue({});
    // Already capitalised: the extra equals the original.
    await searchWithFallback("Наруто", run, keyOf, {
      extraVariants: (term) => [sentenceCase(term)],
    });

    const tried = run.mock.calls.map(([term]) => term);
    expect(new Set(tried).size).toBe(tried.length);
  });

  it("skips the fallback entirely when the original already answered", async () => {
    const run = catalogue({ "атака титанов": enough });
    await searchWithFallback("атака титанов", run, keyOf, {
      extraVariants: (term) => [sentenceCase(term)],
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(enough.length).toBeGreaterThanOrEqual(MIN_RESULTS_BEFORE_FALLBACK);
  });

  it("merges what the extra found onto a thin original, without duplicates", async () => {
    const run = catalogue({
      "атака титанов": ["shared"],
      "Атака титанов": ["shared", "extra"],
    });

    const { results } = await searchWithFallback("атака титанов", run, keyOf, {
      extraVariants: (term) => [sentenceCase(term)],
    });

    expect(results).toEqual(["shared", "extra"]);
  });

  it("does not report a capitalisation as a correction to the user", async () => {
    const run = catalogue({ "Твоя апрельская ложь": ["Your lie in April"] });

    const { correctedQuery } = await searchWithFallback("твоя апрельская ложь", run, keyOf, {
      extraVariants: (term) => [sentenceCase(term)],
    });

    // Nobody mistyped anything; "did you mean" would be an insult here.
    expect(correctedQuery).toBeNull();
  });

  it("offers no extras for a Latin query", async () => {
    const run = catalogue({});
    await searchWithFallback("shigatsu wa kimi no uso", run, keyOf, {
      extraVariants: () => [],
    });

    expect(run.mock.calls.map(([t]) => t)).toEqual(["shigatsu wa kimi no uso"]);
  });
});
