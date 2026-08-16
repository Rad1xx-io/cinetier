import type { Metadata } from "next";
import { DiscoverClient } from "@/components/search/discover-client";
import { loadInitial } from "@/lib/catalog/initial-data";
import { itemListJsonLd } from "@/lib/seo/json-ld";
import { titleHref } from "@/lib/utils/title-route";
import { JsonLd } from "@/components/seo/json-ld";
import { discoverTitles } from "@/lib/tmdb/discover";
import type { SearchResponse } from "@/lib/types";

/*
 * Rendered per request rather than prerendered.
 *
 * The listing is a client component that reads useSearchParams, and Next makes
 * that bail out to the client during a prerender unless it sits behind a
 * Suspense boundary — which would put the skeleton in the static HTML and undo
 * the whole point of this page. Rendering on demand removes the bailout.
 *
 * The upstream cost stays bounded anyway: the catalogue clients each cache
 * their fetch for five minutes, so repeated renders mostly hit that rather
 * than the API.
 */
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Browse popular films and TV shows, filter by genre, year and rating, then rank what you have seen into tiers from S to F.";

export const metadata: Metadata = {
  title: "Films and TV — TierListOnline",
  description: DESCRIPTION,
  alternates: { canonical: "/discover" },
  openGraph: {
    title: "Films and TV — TierListOnline",
    description: DESCRIPTION,
    url: "/discover",
  },
  twitter: { title: "Films and TV — TierListOnline", description: DESCRIPTION },
};

export default async function DiscoverPage() {
  const discovered = await loadInitial("discover", () =>
    discoverTitles({ type: "all", sort: "popularity", page: 1 })
  );

  // discoverTitles reports the page count but not which page it returned; the
  // client's shape carries both, and this is always the first.
  const initialData: SearchResponse | null = discovered ? { page: 1, ...discovered } : null;

  return (
    <>
      {initialData?.results.length ? (
        <JsonLd
          data={itemListJsonLd(
            initialData.results.map((title) => ({
              type: title.mediaType === "tv" ? "TVSeries" : "Movie",
              name: title.title,
              path: titleHref(title.mediaType, title.tmdbId),
            })),
            "/discover",
            "Popular films and TV shows"
          )}
        />
      ) : null}
      <DiscoverClient initialData={initialData} />
    </>
  );
}
