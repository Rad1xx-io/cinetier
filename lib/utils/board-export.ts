import type { Options } from "html-to-image/lib/types";

/**
 * How the board is turned into a picture.
 *
 * Kept out of the component so the settings that decide whether a cover
 * survives the export can be exercised by a test — the failure this guards
 * against is silent by construction, and a board of blank cards is a valid
 * PNG.
 */

/** Stands in for a cover the browser could not fetch. 1x1, fully transparent. */
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** The board is transparent by design; the export paints this behind it. */
const BOARD_BACKGROUND = "#09090b";

export { TRANSPARENT_PIXEL, BOARD_BACKGROUND };

export function boardSvgOptions(): Options {
  return {
    backgroundColor: BOARD_BACKGROUND,
    // The toolbar and per-card controls mark themselves with `data-export-hide`.
    filter: (el) => !(el instanceof HTMLElement && el.dataset.exportHide !== undefined),
    /*
     * One cover that will not load must not cost the whole board.
     *
     * The library inlines every image as a data URI before it rasterises
     * anything. When a fetch fails — TMDB genuinely 404s a few posters,
     * and the optimiser answers a burst of parallel requests with rate
     * limits — it falls back to this placeholder, and without one it
     * assigns an empty src instead, which fires an error event that
     * rejects the entire export. `onImageErrorHandler` catches the same
     * thing one step later, for an image that loads to something the
     * browser then refuses to decode.
     */
    imagePlaceholder: TRANSPARENT_PIXEL,
    onImageErrorHandler: () => {},
    /*
     * Every cover on the board is one `/_next/image` request, and they
     * differ only in the query. The library caches what it inlines, and
     * its key drops the query unless this is set — so all of them share
     * one entry. Within a single export the fetches start together and
     * each card still gets its own picture, but the entry keeps whichever
     * finished last, and the *next* export in the same tab hands that one
     * image to every card. Filters looked like the trigger only because
     * changing one is what makes somebody export twice.
     */
    includeQueryParams: true,
    /*
     * Every cover is re-requested from the network rather than taken from
     * the browser's cache, and without this the board exports blank.
     *
     * The covers are displayed by plain `<img>` tags with no
     * `crossOrigin`, so the browser fetches them in no-cors mode and
     * files the response in its cache as opaque. The library then asks
     * for the same URL with `fetch`, which is cors mode, and the cached
     * opaque entry cannot answer a cors request — so it fails with a
     * bare `TypeError: Failed to fetch`, every cover at once, and each
     * one quietly becomes the transparent placeholder above. The CDNs
     * are blameless: they send `Access-Control-Allow-Origin: *`, and the
     * identical request succeeds the moment it is allowed to reach them.
     *
     * `reload` skips the poisoned entry and replaces it with a cors-clean
     * one, so the cost is one small request per cover, once, at the only
     * moment anybody is waiting for a picture anyway.
     */
    fetchRequestInit: { cache: "reload" },
    // Without this the library walks every stylesheet and inlines each web
    // font as a data URI before it will rasterise anything — on a slow link
    // that step alone can outlast the user's patience, and it buys nothing
    // here because the export is a picture of posters, not of typography.
    skipFonts: true,
  };
}
