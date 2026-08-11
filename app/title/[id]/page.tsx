import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { parseTitleParam } from "@/lib/utils/title-route";
import { tmdbFetch, TMDBError } from "@/lib/tmdb/client";
import { mapToDetails } from "@/lib/tmdb/mappers";
import type { TMDBRawMovie, TMDBRawTVShow } from "@/lib/tmdb/types";
import { TitleDetailsView } from "@/components/title-details/title-details-view";
import { TitleDetailsError } from "@/components/title-details/title-details-error";

type LoadResult =
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "ok"; details: Awaited<ReturnType<typeof mapToDetails>> };

async function loadDetails(id: string): Promise<LoadResult> {
  const parsed = parseTitleParam(id);
  if (!parsed) return { kind: "not-found" };

  try {
    const raw =
      parsed.mediaType === "tv"
        ? await tmdbFetch<TMDBRawTVShow>(`/tv/${parsed.tmdbId}`)
        : await tmdbFetch<TMDBRawMovie>(`/movie/${parsed.tmdbId}`);
    return { kind: "ok", details: mapToDetails(raw, parsed.mediaType) };
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
    return { title: `${result.details.title} — CineTier` };
  }
  return { title: "CineTier" };
}

export default async function TitleDetailsPage(props: PageProps<"/title/[id]">) {
  const { id } = await props.params;
  const result = await loadDetails(id);

  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <TitleDetailsError />;

  return <TitleDetailsView details={result.details} />;
}
