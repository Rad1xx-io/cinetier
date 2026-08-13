export function releaseYear(dateStr: string | null): string {
  if (!dateStr) return "—";
  const year = dateStr.slice(0, 4);
  return year || "—";
}

export function formatRating(value: number): string {
  return value > 0 ? value.toFixed(1) : "—";
}

export function mediaTypeLabel(mediaType: "movie" | "tv"): string {
  return mediaType === "movie" ? "Фильм" : "Сериал";
}

/** e.g. 1_200_000 -> "1,2 млн", 45_000 -> "45 тыс.", 900 -> "900" */
export function formatCompactCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} млн`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(".", ",").replace(",0", "")} тыс.`;
  return String(value);
}
