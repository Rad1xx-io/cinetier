import { describe, expect, it } from "vitest";
import { pluralizeRu, titlesCountLabel } from "@/lib/utils/pluralize-ru";

describe("pluralizeRu", () => {
  it.each([
    [1, "один"],
    [21, "один"],
    [101, "один"],
  ])("%i -> one form", (n, expected) => {
    expect(pluralizeRu(n, "один", "два", "много")).toBe(expected);
  });

  it.each([
    [2, "два"],
    [3, "два"],
    [4, "два"],
    [22, "два"],
    [24, "два"],
  ])("%i -> few form", (n, expected) => {
    expect(pluralizeRu(n, "один", "два", "много")).toBe(expected);
  });

  it.each([
    [0, "много"],
    [5, "много"],
    [11, "много"],
    [12, "много"],
    [14, "много"],
    [25, "много"],
    [100, "много"],
  ])("%i -> many form", (n, expected) => {
    expect(pluralizeRu(n, "один", "два", "много")).toBe(expected);
  });
});

describe("titlesCountLabel", () => {
  it("formats known tricky counts correctly", () => {
    expect(titlesCountLabel(1)).toBe("1 тайтл");
    expect(titlesCountLabel(2)).toBe("2 тайтла");
    expect(titlesCountLabel(5)).toBe("5 тайтлов");
    expect(titlesCountLabel(11)).toBe("11 тайтлов");
    expect(titlesCountLabel(21)).toBe("21 тайтл");
  });
});
