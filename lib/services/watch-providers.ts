import {
  attachAffiliateParams,
  providerFromTmdbName,
  safeAffiliateUrl,
} from "@/lib/utils/affiliate-url";

/*
 * Parsing and link-building, kept apart from the fetch.
 *
 * `lib/tmdb/client` imports `server-only`, which by design refuses to load
 * anywhere but a server component — including under the test runner. The same
 * split the project already draws between `lib/tmdb/mappers` and
 * `lib/tmdb/client`: the logic worth testing does not need the network, and
 * should not inherit its constraints.
 */

/** How a service offers the title. Ordered by what a viewer usually wants first. */
export type OfferKind = "flatrate" | "free" | "ads" | "rent" | "buy";

const OFFER_KINDS: OfferKind[] = ["flatrate", "free", "ads", "rent", "buy"];

export interface WatchProvider {
  providerId: number;
  name: string;
  kind: OfferKind;
  logoPath: string | null;
}

export interface WatchProviders {
  region: string;
  /** TMDB's own watch page for the title. Their terms want this surfaced. */
  link: string | null;
  providers: WatchProvider[];
}

interface RawProvider {
  provider_id?: number;
  provider_name?: string;
  logo_path?: string | null;
  display_priority?: number;
}

interface RawRegion {
  link?: string;
  flatrate?: RawProvider[];
  free?: RawProvider[];
  ads?: RawProvider[];
  rent?: RawProvider[];
  buy?: RawProvider[];
}

export interface RawWatchProvidersResponse {
  id?: number;
  results?: Record<string, RawRegion | undefined>;
}

/**
 * Pulls one region out of TMDB's response.
 *
 * Kept apart from the fetch so the parsing — which is where the awkwardness
 * lives — can be tested against real payloads without a network call.
 *
 * A service can appear under several kinds at once (rentable *and* buyable);
 * the first kind in `OFFER_KINDS` wins, so each service is listed once, under
 * the best offer it makes.
 */
export function parseWatchProviders(
  payload: RawWatchProvidersResponse | null | undefined,
  region: string
): WatchProviders | null {
  const block = payload?.results?.[region.toUpperCase()];
  if (!block) return null;

  const seen = new Set<number>();
  const providers: WatchProvider[] = [];

  for (const kind of OFFER_KINDS) {
    const entries = block[kind];
    if (!Array.isArray(entries)) continue;

    const sorted = [...entries].sort(
      (a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999)
    );

    for (const entry of sorted) {
      const providerId = entry.provider_id;
      const name = entry.provider_name?.trim();
      if (typeof providerId !== "number" || !name || seen.has(providerId)) continue;

      seen.add(providerId);
      providers.push({ providerId, name, kind, logoPath: entry.logo_path ?? null });
    }
  }

  const link = block.link?.trim();
  // Nothing on offer and no page to send anyone to is not a result worth having.
  if (providers.length === 0 && !link) return null;

  return { region: region.toUpperCase(), link: link || null, providers };
}

/**
 * Turns availability into the link record the UI renders.
 *
 * TMDB gives a name and a logo, never a URL, so there is no deep link to the
 * exact page to be had. What can be built truthfully is a search at the right
 * service, which is what the registry's `searchUrl` does; services with no
 * template are simply left out rather than guessed at.
 *
 * TMDB's own watch page is included under `tmdb`, both because their terms want
 * it surfaced and because it is the one link that does point straight at the
 * title's offers.
 */
export function providersToAffiliateLinks(
  providers: WatchProviders | null | undefined,
  titleName: string
): Record<string, string> {
  if (!providers) return {};

  const links: Record<string, string> = {};

  for (const offer of providers.providers) {
    const entry = providerFromTmdbName(offer.name);
    if (!entry?.searchUrl) continue;
    if (links[entry.id]) continue;

    const url = safeAffiliateUrl(entry.id, entry.searchUrl(titleName));
    if (url) links[entry.id] = attachAffiliateParams(entry.id, url);
  }

  if (providers.link) {
    const url = safeAffiliateUrl("tmdb", providers.link);
    if (url) links.tmdb = url;
  }

  return links;
}
