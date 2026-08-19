/**
 * Hosts whose images the browser fetches for itself.
 *
 * Next's optimizer is a server that downloads the upstream image, re-encodes
 * it and serves the result. That is worth paying for on images this app cannot
 * predict, and it is a liability on the ones it can: on Vercel the service is
 * metered, and once the plan's quota is spent every *new* transformation comes
 * back `402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` while already-cached ones
 * keep serving — so the site loses precisely the covers a visitor has not seen
 * before, which on a catalogue is most of them.
 *
 * The four hosts below are all image CDNs that already serve at the size this
 * app asks for (`w342` posters, `t_cover_big` capsules), so going straight to
 * them costs a re-encode — JPEG instead of WebP — and buys immunity from that
 * quota, from the optimizer's own rate limits, and from its refusal to fetch
 * upstreams that resolve to special-use addresses (which is why Steam was
 * already on this list, long before the quota was a problem: on a NAT64
 * network its CDNs resolve into `64:ff9b::/96` and every capsule 400s).
 */
const DIRECT_HOSTS = [
  // Steam store art.
  "steamstatic.com",
  "akamaihd.net",
  "steampowered.com",
  // TMDB posters and backdrops — films, TV, and every catalogue built on them.
  "image.tmdb.org",
  // IGDB cover art, which reaches this app through the same poster component.
  "images.igdb.com",
  // AniList covers and banners: the whole anime catalogue.
  "anilist.co",
  // MyAnimeList, which serves those covers when the anime source is Jikan.
  "cdn.myanimelist.net",
  // YouTube avatars and channel banners. Narrow on purpose — `googleusercontent`
  // covers half of Google, and only the yt3 host serves this app's images.
  "yt3.googleusercontent.com",
  "ggpht.com",
];

function hostOf(src: string): string | null {
  try {
    return new URL(src).hostname.toLowerCase();
  } catch {
    // A relative path — same-origin, and nothing here applies to it.
    return null;
  }
}

/**
 * Whether this image should skip the optimizer and load from its own CDN.
 *
 * Matched on the host rather than by substring: a path is attacker-adjacent
 * input here, and `/posters/image.tmdb.org/x.jpg` on some other domain should
 * not talk its way onto this list.
 */
export function isUnoptimizedSource(src: string | null | undefined): boolean {
  if (!src) return false;
  const host = hostOf(src);
  if (!host) return false;
  return DIRECT_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}


/**
 * The width a card actually renders at, read from the `sizes` hint it already
 * passes to the browser.
 */
export function displayWidthFromSizes(sizes: string | undefined, fallback = 180): number {
  // The media conditions are dropped first: "(max-width: 640px) 144px, 192px"
  // describes a card that is never wider than 192, and reading the breakpoint
  // as a width makes every small card look like a big one.
  const lengths = (sizes ?? "").replace(/\([^)]*\)/g, "");
  const widths = lengths.match(/(\d+)px/g)?.map((px) => parseInt(px, 10)) ?? [];
  return widths.length ? Math.max(...widths) : fallback;
}

/** TMDB publishes these poster widths; anything else 404s. */
const TMDB_POSTER_WIDTHS = [92, 154, 185, 342, 500, 780];

/**
 * Asks a CDN for the size the layout will actually paint.
 *
 * Every host here encodes the size in the URL, and every one of them defaulted
 * to something far larger than the card it lands in: AniList hands out `large`
 * covers (81KB) for a 112px grid tile, YouTube hands out `s800` avatars (35KB)
 * for a 48px circle. While Next's optimizer was in front of them that was
 * invisible, because it re-encoded down to the layout's width. Fetching
 * directly, the request has to be right the first time.
 *
 * Unknown hosts and unrecognised URL shapes come back untouched.
 */
export function resizeCdnImage(src: string, displayPx: number): string {
  // Two-times for a retina screen.
  const wanted = displayPx * 2;

  // TMDB: the width is a path segment.
  const tmdb = src.match(/(https:\/\/image\.tmdb\.org\/t\/p\/)w(\d+)(\/.+)$/);
  if (tmdb) {
    const width = TMDB_POSTER_WIDTHS.find((w) => w >= wanted) ?? TMDB_POSTER_WIDTHS[TMDB_POSTER_WIDTHS.length - 1];
    return `${tmdb[1]}w${width}${tmdb[3]}`;
  }

  // AniList: `medium` is 230px wide, `large` is 460px. A grid tile is 180px at
  // the widest, so medium is the one that belongs there — the same cap the TMDB
  // sizes take, and for the same reason: a page holds two dozen of these. The
  // details page passes an explicit `size`, which skips this rewrite entirely
  // and keeps whatever the catalogue handed over.
  const anilist = src.match(/(https:\/\/s\d\.anilist\.co\/.*\/cover\/)(medium|large)(\/.+)$/);
  if (anilist) {
    return `${anilist[1]}${wanted > 460 ? "large" : "medium"}${anilist[3]}`;
  }

  // YouTube: the size rides in the parameter suffix, `=s800-c-k-...`.
  const youtube = src.match(/^(https:\/\/[^/]*(?:ggpht\.com|yt3\.googleusercontent\.com)\/[^=]+)=s(\d+)(-.*)?$/);
  if (youtube) {
    const bucket = [88, 176, 240, 400, 800].find((s) => s >= wanted) ?? 800;
    return `${youtube[1]}=s${bucket}${youtube[3] ?? ""}`;
  }

  return src;
}
