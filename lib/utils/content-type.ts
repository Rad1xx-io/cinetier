import type { MediaType } from "@/lib/types";

/** Every catalog TierListOnline ranks, including the one stored outside RankedTitle. */
export type ContentType = MediaType | "youtube";

export interface ContentTypeAccent {
  label: string;
  /** Badge face: tinted background, matching border, readable text. */
  badge: string;
  /** Icon/label colour on its own. */
  text: string;
  hoverBorder: string;
  hoverBg: string;
}

/**
 * One colour per catalog, used by the card badges and the empty state.
 *
 * Written as complete class strings rather than assembled from fragments —
 * Tailwind only ships classes it can find in the source, so a name built at
 * runtime (`text-${colour}-400`) would be purged from the stylesheet.
 */
export const CONTENT_TYPE_ACCENTS: Record<ContentType, ContentTypeAccent> = {
  movie: {
    label: "Film",
    badge: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    text: "text-amber-400",
    hoverBorder: "hover:border-amber-500/40",
    hoverBg: "hover:bg-amber-500/10",
  },
  tv: {
    label: "TV",
    badge: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    text: "text-amber-400",
    hoverBorder: "hover:border-amber-500/40",
    hoverBg: "hover:bg-amber-500/10",
  },
  anime: {
    label: "Anime",
    badge: "border-purple-500/30 bg-purple-500/15 text-purple-300",
    text: "text-purple-400",
    hoverBorder: "hover:border-purple-500/40",
    hoverBg: "hover:bg-purple-500/10",
  },
  game: {
    label: "Game",
    badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    text: "text-emerald-400",
    hoverBorder: "hover:border-emerald-500/40",
    hoverBg: "hover:bg-emerald-500/10",
  },
  youtube: {
    label: "YouTube",
    badge: "border-red-500/30 bg-red-500/15 text-red-300",
    text: "text-red-400",
    hoverBorder: "hover:border-red-500/40",
    hoverBg: "hover:bg-red-500/10",
  },
};

export function contentTypeAccent(type: ContentType): ContentTypeAccent {
  return CONTENT_TYPE_ACCENTS[type];
}

/**
 * Plural names for the catalogs, for prose rather than for a badge.
 *
 * Films and TV share an entry: they come from the same catalog, sit together
 * everywhere in the app, and a board holding both is one thing to its owner,
 * not two.
 */
const CATALOG_PROSE: { types: MediaType[]; label: string }[] = [
  { types: ["movie", "tv"], label: "films and TV" },
  { types: ["movie"], label: "films" },
  { types: ["tv"], label: "TV series" },
  { types: ["anime"], label: "anime" },
  { types: ["game"], label: "games" },
];

/**
 * Names the catalogs a collection actually spans.
 *
 * The dashboard shelves show whatever has been ranked — for one person that is
 * only games, for another it is all four — so a fixed subtitle was wrong for
 * everyone it did not happen to describe. Returns null for an empty collection,
 * which has no catalogs to name.
 */
export function rankedCatalogsLabel(types: Iterable<MediaType>): string | null {
  const present = new Set(types);
  if (present.size === 0) return null;

  const parts: string[] = [];
  for (const entry of CATALOG_PROSE) {
    if (!entry.types.every((type) => present.has(type))) continue;
    // A pairing claims its members, so "movie" alone cannot also match after
    // "films and TV" already spoke for it.
    entry.types.forEach((type) => present.delete(type));
    parts.push(entry.label);
  }

  if (parts.length === 1) return parts[0];

  // "films and TV and games" runs two conjunctions together; a comma before the
  // last one keeps the pairing readable.
  const separator = parts.some((part) => part.includes(" and ")) ? ", and " : " and ";
  return `${parts.slice(0, -1).join(", ")}${separator}${parts[parts.length - 1]}`;
}

/** "all" plus every catalog — the vocabulary any category filter draws from. */
export type CategoryFilter = "all" | ContentType;

export const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Films" },
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
  { value: "game", label: "Games" },
  { value: "youtube", label: "YouTube" },
];
