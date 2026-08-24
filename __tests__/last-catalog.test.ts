import { beforeEach, describe, expect, it } from "vitest";
import {
  LAST_CATALOG_KEY,
  openingCatalog,
  readLastCatalog,
  rememberCatalog,
  rememberCatalogIfUnset,
} from "@/lib/storage/last-catalog";
import type { ContentType } from "@/lib/utils/content-type";

const empty: Record<ContentType, number> = {
  movie: 0,
  tv: 0,
  anime: 0,
  game: 0,
  youtube: 0,
};

beforeEach(() => localStorage.clear());

describe("remembering which list the board was left on", () => {
  it("gives back what was stored", () => {
    rememberCatalog("game");
    expect(readLastCatalog()).toBe("game");
    expect(localStorage.getItem(LAST_CATALOG_KEY)).toBe("game");
  });

  it("treats a value that is not one of the five as nothing at all", () => {
    // "all" is the entry this replaced, and an old browser may still hold it.
    localStorage.setItem(LAST_CATALOG_KEY, "all");
    expect(readLastCatalog()).toBeNull();

    localStorage.setItem(LAST_CATALOG_KEY, "{}");
    expect(readLastCatalog()).toBeNull();

    localStorage.setItem(LAST_CATALOG_KEY, "");
    expect(readLastCatalog()).toBeNull();
  });
});

describe("which list opens", () => {
  it("opens the remembered one even when it is empty today", () => {
    rememberCatalog("movie");

    // Films hold nothing and games hold four. The old rule would have opened
    // games; opening anywhere but where somebody left off is the surprise
    // this exists to remove.
    expect(openingCatalog({ ...empty, game: 4 })).toBe("movie");
  });

  it("falls back to the first stocked list when nothing is remembered", () => {
    expect(openingCatalog({ ...empty, anime: 3, game: 4 })).toBe("anime");
  });

  it("falls back to films for somebody who has ranked nothing", () => {
    expect(openingCatalog(empty)).toBe("movie");
  });

  it("ignores a corrupt value rather than opening on it", () => {
    localStorage.setItem(LAST_CATALOG_KEY, "movies");
    expect(openingCatalog({ ...empty, youtube: 2 })).toBe("youtube");
  });
});

describe("recording a choice nobody made explicitly", () => {
  it("takes the first ranking as the answer when none was given", () => {
    rememberCatalogIfUnset("game");
    expect(readLastCatalog()).toBe("game");
  });

  it("leaves an explicit choice alone", () => {
    rememberCatalog("youtube");
    // Adding one film from a catalogue page must not relocate the board.
    rememberCatalogIfUnset("movie");
    expect(readLastCatalog()).toBe("youtube");
  });

  it("replaces a stored value that is no longer valid", () => {
    localStorage.setItem(LAST_CATALOG_KEY, "all");
    rememberCatalogIfUnset("anime");
    expect(readLastCatalog()).toBe("anime");
  });
});
