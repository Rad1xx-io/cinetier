/**
 * Vets an author-supplied donation link before anything renders it.
 *
 * This value is typed by one user and opened by another, which makes it the
 * most dangerous field in the profile. `javascript:` and `data:` URIs execute
 * in the clicker's tab, so scheme is checked rather than assumed; a bare
 * `boostyeu.to/name` is normalised to https rather than rejected, because
 * pasting a link without the scheme is what people actually do.
 *
 * Returns null for anything that does not survive — callers render nothing.
 */
export function safeDonationUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Without a scheme `new URL` throws, so add the one that is nearly always
  // meant. Done before parsing so `//evil.com` cannot arrive protocol-relative.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  /*
   * HTTPS only.
   *
   * This used to allow `http:` as well, on the reasoning that some tip jars
   * still are — but the link is typed by one person and clicked by another,
   * which makes a plaintext hop somebody else's risk to carry. On the wire it
   * can be rewritten to point somewhere other than where the author meant, and
   * the visitor has no way to tell. Every donation platform this is realistically
   * used for — Boosty, Patreon, Ko-fi, CloudTips — has been HTTPS-only for years,
   * so refusing costs a real author nothing and the alternative is a
   * downgrade-and-redirect that the site would be lending its credibility to.
   *
   * A scheme-less paste is still normalised to https above, so the common case
   * of typing `boosty.to/name` keeps working — only an explicit `http://` is
   * refused, and refused rather than silently upgraded, because silently
   * changing where a link points is its own surprise.
   */
  if (url.protocol !== "https:") return null;
  // A host is what makes it a link somewhere. `https:///path` parses but goes nowhere.
  if (!url.hostname || !url.hostname.includes(".")) return null;

  return url.toString();
}

/** The host, for showing where a link actually leads before it is clicked. */
export function donationUrlHost(raw: string | null | undefined): string | null {
  const safe = safeDonationUrl(raw);
  if (!safe) return null;
  try {
    return new URL(safe).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
