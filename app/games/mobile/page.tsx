import type { Metadata } from "next";
import { MobileGamesDiscoverClient } from "@/components/mobile-game-card/mobile-games-discover-client";

/*
 * Rendered per request, same reasoning as /games/pc — the listing reads
 * useSearchParams and would otherwise bail to the client behind a Suspense
 * boundary, putting a skeleton in the static HTML.
 *
 * Unlike /games/pc, there is no default listing to render here at all — see
 * lib/app-store/discovery.ts's own header for why iTunes Search has nothing
 * to seed one from.
 */
export const dynamic = "force-dynamic";

const DESCRIPTION = "Search the App Store and rank the iPhone and iPad games you have played.";

export const metadata: Metadata = {
  title: "Mobile Games — TierListOnline",
  description: DESCRIPTION,
  alternates: { canonical: "/games/mobile" },
  openGraph: {
    title: "Mobile Games — TierListOnline",
    description: DESCRIPTION,
    url: "/games/mobile",
  },
  twitter: { title: "Mobile Games — TierListOnline", description: DESCRIPTION },
};

export default function MobileGamesPage() {
  return <MobileGamesDiscoverClient />;
}
