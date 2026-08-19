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
  // TMDB posters and backdrops — films, TV, and every catalogue built on them.
  "image.tmdb.org",
  // IGDB cover art, which reaches this app through the same poster component.
  "images.igdb.com",
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
