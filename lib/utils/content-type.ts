import type { MediaType } from "@/lib/types";

/** Every catalog CineTier ranks, including the one stored outside RankedTitle. */
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
    label: "Фильм",
    badge: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    text: "text-amber-400",
    hoverBorder: "hover:border-amber-500/40",
    hoverBg: "hover:bg-amber-500/10",
  },
  tv: {
    label: "Сериал",
    badge: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    text: "text-amber-400",
    hoverBorder: "hover:border-amber-500/40",
    hoverBg: "hover:bg-amber-500/10",
  },
  anime: {
    label: "Аниме",
    badge: "border-purple-500/30 bg-purple-500/15 text-purple-300",
    text: "text-purple-400",
    hoverBorder: "hover:border-purple-500/40",
    hoverBg: "hover:bg-purple-500/10",
  },
  game: {
    label: "Игра",
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
