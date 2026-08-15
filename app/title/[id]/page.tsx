import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { parseTitleParam } from "@/lib/utils/title-route";
import { tmdbFetch, TMDBError } from "@/lib/tmdb/client";
import { mapToDetails } from "@/lib/tmdb/mappers";
import type { TMDBRawMovie, TMDBRawTVShow } from "@/lib/tmdb/types";
import { getWatchProviders, providersToAffiliateLinks } from "@/lib/services/tmdb-providers";
import { TitleDetailsView } from "@/components/title-details/title-details-view";
import { TitleDetailsError } from "@/components/title-details/title-details-error";

type LoadResult =
  | { kind: "not-found" }
  | { kind: "error" }
  | {
      kind: "ok";
      details: Awaited<ReturnType<typeof mapToDetails>>;
      watchLinks: Record<string, string>;
    };

async function loadDetails(id: string): Promise<LoadResult> {
  const parsed = parseTitleParam(id);
  if (!parsed) return { kind: "not-found" };

  try {
    const mediaType = parsed.mediaType === "tv" ? "tv" : "movie";

    // Fetched alongside the details rather than after them: availability is
    // independent of the record, and waiting for one before starting the other
    // would add a round trip to every page load for no reason.
    const [raw, providers] = await Promise.all([
      mediaType === "tv"
        ? tmdbFetch<TMDBRawTVShow>(`/tv/${parsed.tmdbId}`)
        : tmdbFetch<TMDBRawMovie>(`/movie/${parsed.tmdbId}`),
      getWatchProviders(parsed.tmdbId, mediaType),
    ]);

    const details = mapToDetails(raw, parsed.mediaType);
    return {
      kind: "ok",
      details,
      watchLinks: providersToAffiliateLinks(providers, details.title),
    };
  } catch (error) {
    if (error instanceof TMDBError && error.status === 404) {
      return { kind: "not-found" };
    }
    return { kind: "error" };
  }
}

export async function generateMetadata(props: PageProps<"/title/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const result = await loadDetails(id);
  if (result.kind === "ok") {
    return { title: `${result.details.title} — TierListOnline` };
  }
  return { title: "TierListOnline" };
}

export default async function TitleDetailsPage(props: PageProps<"/title/[id]">) {
  const { id } = await props.params;
  const result = await loadDetails(id);

  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <TitleDetailsError />;

  return <TitleDetailsView details={result.details} watchLinks={result.watchLinks} />;
}
