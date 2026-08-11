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
