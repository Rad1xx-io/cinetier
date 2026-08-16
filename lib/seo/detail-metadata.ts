import type { Metadata } from "next";
import { posterUrl } from "@/lib/utils/tmdb-image";

/**
 * The shared shape of a detail page's metadata.
 *
 * Four catalogues describe their entries differently — TMDB has an `overview`
 * and a relative poster path, AniList a stripped `description` and an absolute
 * cover, Steam a `shortDescription`, YouTube a channel blurb — so each page
 * hands over the same four things and the formatting happens once, here.
 */
export interface DetailMetadataInput {
  title: string;
  /** Whatever the catalogue calls its blurb. Empty is fine. */
  description?: string | null;
  /** A TMDB path or an absolute URL; `posterUrl` handles both. */
  image?: string | null;
  /** Rooted path of the page itself, for the canonical and og:url. */
  path: string;
}

/**
 * Search engines show roughly this much. Cutting at a word keeps the tail from
 * reading like a truncated file name.
 */
export const DESCRIPTION_LIMIT = 160;

export function truncateDescription(value: string, limit = DESCRIPTION_LIMIT): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;

  // One character of headroom, so the ellipsis does not push it over.
  const slice = clean.slice(0, limit - 1);
  const lastSpace = slice.lastIndexOf(" ");
  // A single very long word has no space to cut at; a hard cut beats an empty
  // description.
  const cut = lastSpace > limit * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[,;:.\s]+$/, "")}…`;
}

/**
 * What to say about an entry the catalogue gave no blurb for.
 *
 * Naming the title still beats the site-wide description: a search result for
 * an obscure film should say which film, not what the site is.
 */
export function fallbackDescription(title: string): string {
  return `Explore ${title} on TierListOnline. Create your tier list and share your rankings.`;
}

/**
 * Builds the full metadata for one detail page.
 *
 * `metadataBase` in the root layout resolves the relative `url` and image
 * paths, so nothing here needs the origin. og:image is omitted rather than
 * faked when a catalogue has no artwork — a broken preview looks worse in a
 * message than no preview at all.
 */
export function detailMetadata({ title, description, image, path }: DetailMetadataInput): Metadata {
  const pageTitle = `${title} — TierListOnline`;
  const blurb = description?.trim()
    ? truncateDescription(description)
    : fallbackDescription(title);

  // A TMDB path needs the CDN prefix; an AniList, Steam or YouTube URL is
  // already absolute and passes through untouched. w500 is the largest poster
  // size this app requests and comfortably above the 200px minimum crawlers
  // and chat clients expect.
  const resolved = posterUrl(image ?? null, "w500");

  return {
    title: pageTitle,
    description: blurb,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: pageTitle,
      description: blurb,
      url: path,
      ...(resolved ? { images: [{ url: resolved, alt: title }] } : {}),
    },
    twitter: {
      card: resolved ? "summary_large_image" : "summary",
      title: pageTitle,
      description: blurb,
      ...(resolved ? { images: [resolved] } : {}),
    },
  };
}
