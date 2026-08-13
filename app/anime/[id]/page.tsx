import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AniListError } from "@/lib/anilist/client";
import { getAnimeDetails } from "@/lib/anilist/discovery";
import { AnimeDetailsView } from "@/components/anime-details/anime-details-view";
import { AnimeDetailsError } from "@/components/anime-details/anime-details-error";

type LoadResult =
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "ok"; details: Awaited<ReturnType<typeof getAnimeDetails>> & object };

async function loadAnime(id: string): Promise<LoadResult> {
  const anilistId = Number(id);
  if (!Number.isFinite(anilistId)) return { kind: "not-found" };

  try {
    const details = await getAnimeDetails(anilistId);
    if (!details) return { kind: "not-found" };
    return { kind: "ok", details };
  } catch (error) {
    if (error instanceof AniListError && error.status === 404) return { kind: "not-found" };
    return { kind: "error" };
  }
}

export async function generateMetadata(props: PageProps<"/anime/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const result = await loadAnime(id);
  if (result.kind === "ok") {
    return { title: `${result.details.title} — CineTier` };
  }
  return { title: "CineTier" };
}

export default async function AnimeDetailsPage(props: PageProps<"/anime/[id]">) {
  const { id } = await props.params;
  const result = await loadAnime(id);

  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <AnimeDetailsError />;

  return <AnimeDetailsView details={result.details} />;
}
