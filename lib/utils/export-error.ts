/**
 * Turning whatever the export threw into something a person can read.
 *
 * Rasterising goes through html-to-image, which rejects some failures with a
 * raw DOM `Event` rather than an `Error` — an image that would not load hands
 * back the event fired on the element. Stringifying that gives "[object
 * Event]", which is how a real failure reached a real user's screen saying
 * nothing at all.
 */

/** The element an error event came from, when it came from one. */
function failedResource(event: Event): string | null {
  const target = event.target;
  if (target instanceof HTMLImageElement) {
    const src = target.currentSrc || target.src;
    if (!src) return "an image with no source";
    if (src.startsWith("data:")) return "an image that could not be decoded";
    try {
      // The board's covers arrive through Next's optimiser, so the interesting
      // half is the address it was asked to fetch, not the wrapper.
      const url = new URL(src, window.location.href);
      const upstream = url.searchParams.get("url");
      return upstream ?? `${url.hostname}${url.pathname}`;
    } catch {
      return src.slice(0, 80);
    }
  }
  if (target instanceof Element) return `<${target.tagName.toLowerCase()}>`;
  return null;
}

export function describeExportFailure(err: unknown): string {
  if (err instanceof Error) return err.message;

  if (typeof Event !== "undefined" && err instanceof Event) {
    const resource = failedResource(err);
    return resource ? `could not load ${resource}` : `the browser reported a ${err.type} event`;
  }

  if (typeof err === "string") return err;

  // Anything else: name its shape rather than printing "[object Object]".
  return `an unexpected ${typeof err} was thrown`;
}
