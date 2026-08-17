import { describe, expect, it } from "vitest";
import { rankedCatalogsLabel } from "@/lib/utils/content-type";

describe("rankedCatalogsLabel", () => {
  it("names a single catalog", () => {
    expect(rankedCatalogsLabel(["game", "game"])).toBe("games");
    expect(rankedCatalogsLabel(["anime"])).toBe("anime");
  });

  it("treats films and TV as one thing", () => {
    // They come from the same catalog and sit together everywhere else.
    expect(rankedCatalogsLabel(["movie", "tv"])).toBe("films and TV");
  });

  it("keeps films and TV apart when only one is there", () => {
    expect(rankedCatalogsLabel(["movie"])).toBe("films");
    expect(rankedCatalogsLabel(["tv"])).toBe("TV series");
  });

  it("joins two catalogs", () => {
    expect(rankedCatalogsLabel(["anime", "game"])).toBe("anime and games");
  });

  it("does not run two conjunctions together", () => {
    // "films and TV and games" reads as a list that lost its commas.
    expect(rankedCatalogsLabel(["movie", "tv", "game"])).toBe("films and TV, and games");
  });

  it("lists everything a full board holds", () => {
    expect(rankedCatalogsLabel(["movie", "tv", "anime", "game"])).toBe(
      "films and TV, anime, and games"
    );
  });

  it("reads in a fixed order, whatever order things were ranked in", () => {
    // Otherwise the subtitle reshuffles itself as titles are added.
    expect(rankedCatalogsLabel(["game", "anime", "movie"])).toBe(
      rankedCatalogsLabel(["movie", "anime", "game"])
    );
  });

  it("has nothing to name for an empty collection", () => {
    expect(rankedCatalogsLabel([])).toBeNull();
  });
});
