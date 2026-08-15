import type { AnimeSeason, AnimeStatus } from "@/lib/types/anime";

const SEASON_LABELS: Record<AnimeSeason, string> = {
  WINTER: "Winter",
  SPRING: "Spring",
  SUMMER: "Summer",
  FALL: "Fall",
};

const STATUS_LABELS: Record<AnimeStatus, string> = {
  FINISHED: "Finished",
  RELEASING: "Airing",
  NOT_YET_RELEASED: "Announced",
  CANCELLED: "Cancelled",
  HIATUS: "On hiatus",
};

export function seasonLabel(season: AnimeSeason | null): string | null {
  return season ? SEASON_LABELS[season] : null;
}

export function statusLabel(status: AnimeStatus | null): string | null {
  return status ? STATUS_LABELS[status] : null;
}

export function formatScore(score: number | null): string {
  return score !== null && score > 0 ? score.toFixed(1) : "—";
}

export function formatEpisodes(episodes: number | null): string {
  if (!episodes) return "—";
  return `${episodes} ep.`;
}
