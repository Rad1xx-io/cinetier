export interface AffiliateProvider {
  id: string;
  label: string;
  /**
   * How TMDB spells this service in `provider_name`. Their names drift
   * ("Amazon Video", "Amazon Prime Video"), so matching is by this list rather
   * than by massaging the string.
   */
  tmdbNames?: string[];
  /**
   * Builds a link to this service's search for a title.
   *
   * TMDB returns no per-provider URL — only a name and a logo — so a deep link
   * to the exact page cannot be derived. A search lands the viewer on the title
   * at the right service, which is the honest best available.
   */
  searchUrl?: (query: string) => string;
  /** Query parameter this service's partner programme expects, when it has one. */
  affiliateParam?: string;
  /**
   * Hosts this brand is allowed to lead to, matched as domain suffixes so
   * `hd.kinopoisk.ru` passes under `kinopoisk.ru` but `kinopoisk.ru.evil.com`
   * does not.
   */
  hosts: string[];
}

/**
 * The services a link may be labelled with.
 *
 * A registry rather than a free-for-all because the label is a claim: a badge
 * reading "Netflix" that opens somewhere else is the whole point of a phishing
 * link, and an outbound link that earns money is exactly what someone would try
 * to forge. Anything outside this list still renders, but under its own host
 * name — see `affiliateLinkList`.
 */
export const AFFILIATE_PROVIDERS: AffiliateProvider[] = [
  // Russian services. TMDB never reports these — JustWatch, its data source,
  // carries no RU region at all — so they are only ever filled in by hand or by
  // a partner feed. Kept because that is exactly what the stored field is for.
  {
    id: "kinopoisk",
    label: "Kinopoisk",
    hosts: ["kinopoisk.ru"],
    searchUrl: (q) => `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(q)}`,
    affiliateParam: "partner",
  },
  {
    id: "ivi",
    label: "IVI",
    hosts: ["ivi.ru", "ivi.tv"],
    searchUrl: (q) => `https://www.ivi.ru/search/?q=${encodeURIComponent(q)}`,
    affiliateParam: "partner_id",
  },
  {
    id: "okko",
    label: "Okko",
    hosts: ["okko.tv"],
    searchUrl: (q) => `https://okko.tv/search/${encodeURIComponent(q)}`,
    affiliateParam: "utm_source",
  },
  { id: "wink", label: "Wink", hosts: ["wink.ru"] },
  { id: "premier", label: "PREMIER", hosts: ["premier.one"] },
  { id: "kion", label: "KION", hosts: ["kion.ru"] },
  { id: "amediateka", label: "Amediateka", hosts: ["amediateka.ru"] },

  // The services TMDB actually returns, verified against a live response.
  {
    id: "netflix",
    label: "Netflix",
    hosts: ["netflix.com"],
    tmdbNames: ["Netflix", "Netflix basic with Ads", "Netflix Standard with Ads"],
    searchUrl: (q) => `https://www.netflix.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "amazon",
    label: "Amazon",
    hosts: ["amazon.com", "primevideo.com"],
    tmdbNames: ["Amazon Video", "Amazon Prime Video", "Amazon Prime Video with Ads"],
    searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=instant-video`,
    affiliateParam: "tag",
  },
  {
    id: "appletv",
    label: "Apple TV",
    hosts: ["apple.com", "tv.apple.com"],
    tmdbNames: ["Apple TV", "Apple TV+", "Apple TV Plus"],
    searchUrl: (q) => `https://tv.apple.com/search?term=${encodeURIComponent(q)}`,
    affiliateParam: "at",
  },
  {
    id: "disneyplus",
    label: "Disney+",
    hosts: ["disneyplus.com"],
    tmdbNames: ["Disney Plus", "Disney+"],
    searchUrl: (q) => `https://www.disneyplus.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "max",
    label: "Max",
    hosts: ["max.com", "hbomax.com"],
    tmdbNames: ["Max", "HBO Max", "Max Amazon Channel"],
    searchUrl: (q) => `https://www.max.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "hulu",
    label: "Hulu",
    hosts: ["hulu.com"],
    tmdbNames: ["Hulu"],
    searchUrl: (q) => `https://www.hulu.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "paramountplus",
    label: "Paramount+",
    hosts: ["paramountplus.com"],
    tmdbNames: ["Paramount Plus", "Paramount+", "Paramount+ Amazon Channel"],
    searchUrl: (q) => `https://www.paramountplus.com/search/?q=${encodeURIComponent(q)}`,
  },
  {
    id: "tmdb",
    label: "Where to watch (TMDB)",
    hosts: ["themoviedb.org"],
  },
];

const BY_ID = new Map(AFFILIATE_PROVIDERS.map((p) => [p.id, p]));

const BY_TMDB_NAME = new Map(
  AFFILIATE_PROVIDERS.flatMap((p) => (p.tmdbNames ?? []).map((name) => [name.toLowerCase(), p]))
);

/** Resolves TMDB's `provider_name` to a registry entry, or null if unknown. */
export function providerFromTmdbName(name: string): AffiliateProvider | null {
  return BY_TMDB_NAME.get(name.trim().toLowerCase()) ?? null;
}

/**
 * Partner ids, listed one by one on purpose.
 *
 * Next inlines `NEXT_PUBLIC_*` at build time by matching the literal text
 * `process.env.NEXT_PUBLIC_FOO`, so a computed key — `process.env[`NEXT_PUBLIC_${id}...`]`
 * — is replaced by nothing and reads as undefined in the browser. Every id a
 * provider can have must therefore be written out here.
 *
 * These are not secrets: a partner id travels in the URL, visible to anyone who
 * clicks. NEXT_PUBLIC is the correct prefix, not a leak.
 */
const AFFILIATE_IDS: Record<string, string | undefined> = {
  kinopoisk: process.env.NEXT_PUBLIC_KINOPOISK_AFFILIATE_ID,
  ivi: process.env.NEXT_PUBLIC_IVI_AFFILIATE_ID,
  okko: process.env.NEXT_PUBLIC_OKKO_AFFILIATE_ID,
  amazon: process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_ID,
  appletv: process.env.NEXT_PUBLIC_APPLETV_AFFILIATE_ID,
};

/**
 * Adds this service's partner id to a link, when one is configured.
 *
 * Returns the URL untouched otherwise — an unconfigured programme must still
 * produce a working link, just one that earns nothing. An id already present in
 * the URL wins: a hand-entered partner link is more specific than the default.
 *
 * The parameter names come from each programme and are worth confirming against
 * their current documentation before going live; a wrong name costs the
 * commission silently, since the link still works.
 */
export function attachAffiliateParams(provider: string, url: string): string {
  const entry = BY_ID.get(provider.toLowerCase());
  const id = AFFILIATE_IDS[provider.toLowerCase()];
  if (!entry?.affiliateParam || !id) return url;

  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has(entry.affiliateParam)) return url;
    parsed.searchParams.set(entry.affiliateParam, id);
    return parsed.toString();
  } catch {
    // Not a URL this function can safely edit; handing it back unchanged is
    // better than dropping a link the caller already validated.
    return url;
  }
}

/** Suffix match on domain boundaries, so a lookalike host cannot pass. */
function hostMatches(hostname: string, allowed: string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * Vets one watch link before it is rendered.
 *
 * Scheme first: `javascript:` and `data:` execute in the clicker's tab. Then the
 * host, when the id names a service we know — an unknown id has no brand to
 * misrepresent, so it only has to be a real link.
 *
 * Returns null for anything that does not survive; callers render nothing.
 */
export function safeAffiliateUrl(providerId: string, raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Checked before any scheme is added, so "//evil.com" cannot slip through as
  // a protocol-relative value.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname || !url.hostname.includes(".")) return null;

  const provider = BY_ID.get(providerId.toLowerCase());
  if (provider && !hostMatches(url.hostname, provider.hosts)) return null;

  return url.toString();
}

export interface AffiliateLink {
  providerId: string;
  label: string;
  url: string;
  /** False when the id is not in the registry and the host became the label. */
  known: boolean;
}

/**
 * Turns the stored record into the list the UI renders, dropping everything
 * that fails validation. Registry order, so the badges do not reshuffle between
 * titles just because the record's keys were written in a different order.
 */
export function affiliateLinkList(
  links: Record<string, string> | null | undefined
): AffiliateLink[] {
  if (!links) return [];

  const result: AffiliateLink[] = [];

  for (const provider of AFFILIATE_PROVIDERS) {
    const url = safeAffiliateUrl(provider.id, links[provider.id]);
    if (url) result.push({ providerId: provider.id, label: provider.label, url, known: true });
  }

  for (const [id, raw] of Object.entries(links)) {
    if (BY_ID.has(id.toLowerCase())) continue;
    const url = safeAffiliateUrl(id, raw);
    if (!url) continue;
    // Labelled by where it actually goes: naming it after an unvetted key would
    // let the record invent a brand.
    result.push({
      providerId: id,
      label: new URL(url).hostname.replace(/^www\./, ""),
      url,
      known: false,
    });
  }

  return result;
}
