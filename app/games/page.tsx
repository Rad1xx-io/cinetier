import type { Metadata } from "next";
import { GamesDiscoverClient } from "@/components/games-search/games-discover-client";
import { loadInitial } from "@/lib/catalog/initial-data";
import { discoverGames } from "@/lib/games/source";
import type { GameSearchResponse } from "@/lib/types/game";

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
  "Browse games by genre, platform and mode, then rank the ones you have played into tiers from S to F.";

export const metadata: Metadata = {
  title: "Games — TierListOnline",
  description: DESCRIPTION,
  alternates: { canonical: "/games" },
  openGraph: {
    title: "Games — TierListOnline",
    description: DESCRIPTION,
    url: "/games",
  },
  twitter: { title: "Games — TierListOnline", description: DESCRIPTION },
};

export default async function GamesPage() {
  // Reaches IGDB through the Twitch token the server mints for itself. When
  // those credentials are missing the source falls back to Steam, and when
  // both fail `loadInitial` answers null and the client takes over.
  const discovered = await loadInitial("games", () =>
    discoverGames({ sort: "popularity", page: 0 })
  );

  const initialData: GameSearchResponse | null = discovered
    ? {
        results: discovered.results,
        hasMore: discovered.hasMore,
        ...(discovered.stale ? { stale: discovered.stale } : {}),
      }
    : null;

  return <GamesDiscoverClient initialData={initialData} />;
}
