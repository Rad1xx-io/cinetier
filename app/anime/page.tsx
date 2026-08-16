import type { Metadata } from "next";
import { AnimeDiscoverClient } from "@/components/anime-search/anime-discover-client";
import { loadInitial } from "@/lib/catalog/initial-data";
import { itemListJsonLd } from "@/lib/seo/json-ld";
import { JsonLd } from "@/components/seo/json-ld";
import { getAnimeSource } from "@/lib/anime-sources";

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
  "Browse anime by genre, season, format and score, then rank what you have watched into tiers from S to F.";

export const metadata: Metadata = {
  title: "Anime — TierListOnline",
  description: DESCRIPTION,
  alternates: { canonical: "/anime" },
  openGraph: {
    title: "Anime — TierListOnline",
    description: DESCRIPTION,
    url: "/anime",
  },
  twitter: { title: "Anime — TierListOnline", description: DESCRIPTION },
};

export default async function AnimePage() {
  // The same call the /api/anime/search route makes with no parameters, so the
  // markup matches what the client would have fetched a moment later.
  const initialData = await loadInitial("anime", () =>
    getAnimeSource().search({ sort: "popularity", page: 1, perPage: 24 })
  );

  // No Suspense boundary any more: the data is resolved before this renders,
  // and the client component's own `useSearchParams` no longer needs one now
  // that the page itself is not statically prerendered.
  return (
    <>
      {initialData?.results.length ? (
        <JsonLd
          data={itemListJsonLd(
            initialData.results.map((anime) => ({
              type: "TVSeries",
              name: anime.title,
              path: `/anime/${anime.anilistId}`,
            })),
            "/anime",
            "Popular anime"
          )}
        />
      ) : null}
      <AnimeDiscoverClient initialData={initialData} />
    </>
  );
}
