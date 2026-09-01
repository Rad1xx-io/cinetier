import { cache } from "react";
import { notFound } from "next/navigation";
import { catalogueGate } from "@/lib/rate-limit/limiter";
import { CatalogueBusy } from "@/components/media/catalogue-busy";
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
  | { kind: "busy" }
  | { kind: "ok"; details: NonNullable<Awaited<ReturnType<AnimeSource["getDetails"]>>> };

const loadAnime = cache(async (id: string): Promise<LoadResult> => {
  const anilistId = Number(id);
  if (!Number.isFinite(anilistId)) return { kind: "not-found" };

  // Metered before the upstream call, and after the free check above so a
  // malformed id costs nobody anything. This page spends the same catalogue
  // quota as the metered `/api` route beside it; see `catalogueGate`.
  if (await catalogueGate("details")) return { kind: "busy" };


  try {
    const details = await getAnimeSource().getDetails(anilistId);
    if (!details) return { kind: "not-found" };
    return { kind: "ok", details };
  } catch (error) {
    if (error instanceof AnimeSourceError && error.status === 404) return { kind: "not-found" };
    return { kind: "error" };
  }
});

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
  if (result.kind === "busy")
    return <CatalogueBusy backHref="/anime" backLabel="Back to browsing" />;
  if (result.kind === "error") return <AnimeDetailsError />;

  return (
    <>
      <JsonLd data={animeJsonLd(result.details, `/anime/${id}`)} />
      <AnimeDetailsView details={result.details} />
    </>
  );
}
