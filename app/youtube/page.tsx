import type { Metadata } from "next";
import { YouTubeDiscoverClient } from "@/components/youtube-search/youtube-discover-client";
import { loadInitial } from "@/lib/catalog/initial-data";
import { itemListJsonLd } from "@/lib/seo/json-ld";
import { JsonLd } from "@/components/seo/json-ld";
import { discoverChannels } from "@/lib/youtube/channel-lookup";
import type { ChannelSearchResponse } from "@/lib/types/youtube";

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
  "Browse YouTube channels by country and subscriber count, then rank the ones you watch into tiers from S to F.";

export const metadata: Metadata = {
  title: "YouTube channels — TierListOnline",
  description: DESCRIPTION,
  alternates: { canonical: "/youtube" },
  openGraph: {
    title: "YouTube channels — TierListOnline",
    description: DESCRIPTION,
    url: "/youtube",
  },
  twitter: { title: "YouTube channels — TierListOnline", description: DESCRIPTION },
};

export default async function YouTubePage() {
  // The YouTube quota is the tightest of the catalogues, which is what the
  // five-minute revalidate above is really protecting: one render serves every
  // visitor and every crawler in that window.
  const discovered = await loadInitial("youtube", () =>
    discoverChannels({ sort: "subscribers_desc" })
  );

  const initialData: ChannelSearchResponse | null = discovered
    ? {
        results: discovered.results,
        ...(discovered.nextPageToken ? { nextPageToken: discovered.nextPageToken } : {}),
      }
    : null;

  return (
    <>
      {initialData?.results.length ? (
        <JsonLd
          data={itemListJsonLd(
            initialData.results.map((channel) => ({
              type: "Organization",
              name: channel.title,
              path: `/youtube/channel/${channel.channelId}`,
            })),
            "/youtube",
            "Popular YouTube channels"
          )}
        />
      ) : null}
      <YouTubeDiscoverClient initialData={initialData} />
    </>
  );
}
