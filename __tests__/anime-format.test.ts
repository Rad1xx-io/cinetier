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
    expect(formatEpisodes(25)).toBe("25 эп.");
  });

  it("shows a dash when unknown", () => {
    expect(formatEpisodes(null)).toBe("—");
    expect(formatEpisodes(0)).toBe("—");
  });
});

describe("seasonLabel / statusLabel", () => {
  it("translates every season", () => {
    expect(seasonLabel("WINTER")).toBe("Зима");
    expect(seasonLabel("SPRING")).toBe("Весна");
    expect(seasonLabel("SUMMER")).toBe("Лето");
    expect(seasonLabel("FALL")).toBe("Осень");
    expect(seasonLabel(null)).toBeNull();
  });

  it("translates every status", () => {
    expect(statusLabel("FINISHED")).toBe("Завершён");
    expect(statusLabel("RELEASING")).toBe("Онгоинг");
    expect(statusLabel(null)).toBeNull();
  });
});
