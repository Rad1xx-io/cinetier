import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { detailMetadata } from "@/lib/seo/detail-metadata";
import { animeJsonLd } from "@/lib/seo/json-ld";
import { JsonLd } from "@/components/seo/json-ld";
import { AnimeSourceError, getAnimeSource, type AnimeSource } from "@/lib/anime-sources";
import { AnimeDetailsView } from "@/components/anime-details/anime-details-view";
import { AnimeDetailsError } from "@/components/anime-details/anime-details-error";

type LoadResult =
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "ok"; details: NonNullable<Awaited<ReturnType<AnimeSource["getDetails"]>>> };

async function loadAnime(id: string): Promise<LoadResult> {
  const anilistId = Number(id);
  if (!Number.isFinite(anilistId)) return { kind: "not-found" };

  try {
    const details = await getAnimeSource().getDetails(anilistId);
    if (!details) return { kind: "not-found" };
    return { kind: "ok", details };
  } catch (error) {
    if (error instanceof AnimeSourceError && error.status === 404) return { kind: "not-found" };
    return { kind: "error" };
  }
}

export async function generateMetadata(props: PageProps<"/anime/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const result = await loadAnime(id);
  if (result.kind === "ok") {
    return detailMetadata({
      title: result.details.title,
      description: result.details.description,
      image: result.details.coverImage,
      path: `/anime/${id}`,
    });
  }
  return { title: "TierListOnline" };
}

export default async function AnimeDetailsPage(props: PageProps<"/anime/[id]">) {
  const { id } = await props.params;
  const result = await loadAnime(id);

  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <AnimeDetailsError />;

  return (
    <>
      <JsonLd data={animeJsonLd(result.details, `/anime/${id}`)} />
      <AnimeDetailsView details={result.details} />
    </>
  );
}
