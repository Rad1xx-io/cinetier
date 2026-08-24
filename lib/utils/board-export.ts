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

/** Retina-ish scale for the artwork. */
const EXPORT_SCALE = 2;

/**
 * Browsers stop honouring a canvas past roughly this on a side and return a
 * blank one, so a very tall board is scaled down rather than exported empty.
 */
const MAX_CANVAS_SIDE = 16_384;

/** How long to wait before giving up, so a stalled capture is not forever. */
export const EXPORT_TIMEOUT_MS = 20_000;

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

/**
 * Rasterises a board element and hands back a PNG data url.
 *
 * `toPng` is deliberately not used. It ends in the library's own
 * `createImage`, which resolves inside a `requestAnimationFrame` — and a tab
 * that is not compositing is never given a frame, so the promise never settles
 * and the export dies on the timeout with nothing to show. What follows is
 * what the library's `toCanvas` does, minus that frame.
 */
export async function renderBoardPng(node: HTMLElement): Promise<string> {
  // Imported here rather than at module scope: the library is only needed the
  // moment somebody actually exports, and it is far from small.
  const { toSvg } = await import("html-to-image");

  const render = (async () => {
    const svg = await toSvg(node, boardSvgOptions());

    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("the board could not be rasterised"));
      image.src = svg;
    });

    // The SVG carries the size the library measured, so the canvas takes it
    // from the image rather than measuring the board a second time.
    const width = image.naturalWidth || node.clientWidth;
    const height = image.naturalHeight || node.clientHeight;
    const scale = Math.min(EXPORT_SCALE, MAX_CANVAS_SIDE / Math.max(width, height));

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("this browser offered no canvas to draw on");

    // The board is transparent by design, so without this the PNG comes out
    // see-through, which reads as black in most viewers.
    context.fillStyle = BOARD_BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL();
  })();

  return Promise.race([
    render,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("export-timeout")), EXPORT_TIMEOUT_MS)
    ),
  ]);
}

/** Offers a rendered board to the browser as a file to save. */
export function downloadPng(dataUrl: string, name: string): void {
  const link = document.createElement("a");
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = dataUrl;
  link.click();
}
