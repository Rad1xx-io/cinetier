/**
 * The share preview a page falls back to when it has no picture of its own.
 *
 * Deliberately not the `opengraph-image` file convention: file-based metadata
 * outranks `generateMetadata` (see the note in Next's generate-metadata
 * reference), so a banner placed at the app root would have replaced the
 * posters on /title/[id] — the one set of pages whose previews are already
 * right. Referenced explicitly instead, from the two places that need it.
 */

/** Served by app/og/banner/route.tsx. Relative, so `metadataBase` resolves it. */
export const OG_IMAGE_PATH = "/og/banner";

/** What every scraper expects: 1.91:1, and large enough for a retina timeline. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

export const OG_IMAGE_ALT = "TierListOnline — rank what you watch and play";

/**
 * Ready to drop into an `openGraph.images` or `twitter.images` array.
 *
 * Dimensions are declared rather than left to be discovered: a scraper that
 * has to fetch the file to learn its shape often renders the card without it.
 */
export const defaultOgImage = {
  url: OG_IMAGE_PATH,
  width: OG_IMAGE_SIZE.width,
  height: OG_IMAGE_SIZE.height,
  alt: OG_IMAGE_ALT,
};
