import { describe, expect, it } from "vitest";
import { formatEpisodes, formatScore, seasonLabel, statusLabel } from "@/lib/utils/anime-format";

describe("formatScore", () => {
  it("formats a positive score to one decimal", () => {
    expect(formatScore(8.5)).toBe("8.5");
  });

  it("shows a dash for null or zero", () => {
    expect(formatScore(null)).toBe("—");
    expect(formatScore(0)).toBe("—");
  });
});

describe("formatEpisodes", () => {
  it("appends the Russian abbreviation", () => {
    expect(formatEpisodes(25)).toBe("25 ep.");
  });

  it("shows a dash when unknown", () => {
    expect(formatEpisodes(null)).toBe("—");
    expect(formatEpisodes(0)).toBe("—");
  });
});

describe("seasonLabel / statusLabel", () => {
  it("translates every season", () => {
    expect(seasonLabel("WINTER")).toBe("Winter");
    expect(seasonLabel("SPRING")).toBe("Spring");
    expect(seasonLabel("SUMMER")).toBe("Summer");
    expect(seasonLabel("FALL")).toBe("Fall");
    expect(seasonLabel(null)).toBeNull();
  });

  it("translates every status", () => {
    expect(statusLabel("FINISHED")).toBe("Finished");
    expect(statusLabel("RELEASING")).toBe("Airing");
    expect(statusLabel(null)).toBeNull();
  });
});
