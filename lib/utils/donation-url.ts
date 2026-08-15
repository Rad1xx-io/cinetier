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

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
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
