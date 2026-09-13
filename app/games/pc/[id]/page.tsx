import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogueGate } from "@/lib/rate-limit/limiter";
import { CatalogueBusy } from "@/components/media/catalogue-busy";
import { detailMetadata } from "@/lib/seo/detail-metadata";
import { gameJsonLd } from "@/lib/seo/json-ld";
import { JsonLd } from "@/components/seo/json-ld";
import { SteamError } from "@/lib/steam/client";
import { getGameDetails } from "@/lib/games/source";
import { GameDetailsView } from "@/components/game-details/game-details-view";
import { GameDetailsError } from "@/components/game-details/game-details-error";

type LoadResult =
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "busy" }
  | { kind: "ok"; details: NonNullable<Awaited<ReturnType<typeof getGameDetails>>> };

const loadGame = cache(async (id: string): Promise<LoadResult> => {
  const appId = Number(id);
  if (!Number.isFinite(appId)) return { kind: "not-found" };

  // Metered before the upstream call, and after the free check above so a
  // malformed id costs nobody anything. This page spends the same catalogue
  // quota as /api/games/details beside it — both use the "details" tier —
  // see `catalogueGate`.
  if (await catalogueGate("details")) return { kind: "busy" };

  try {
    const details = await getGameDetails(appId);
    if (!details) return { kind: "not-found" };
    return { kind: "ok", details };
  } catch (error) {
    if (error instanceof SteamError && error.status === 404) return { kind: "not-found" };
    return { kind: "error" };
  }
});

export async function generateMetadata(props: PageProps<"/games/pc/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const result = await loadGame(id);
  if (result.kind === "ok") {
    return detailMetadata({
      title: result.details.title,
      description: result.details.shortDescription,
      image: result.details.posterPath,
      path: `/games/pc/${id}`,
    });
  }
  return { title: "TierListOnline" };
}

export default async function GameDetailsPage(props: PageProps<"/games/pc/[id]">) {
  const { id } = await props.params;
  const result = await loadGame(id);

  if (result.kind === "not-found") notFound();
  if (result.kind === "busy")
    return <CatalogueBusy backHref="/games/pc" backLabel="Back to browsing" />;
  if (result.kind === "error") return <GameDetailsError />;

  return (
    <>
      <JsonLd data={gameJsonLd(result.details, `/games/pc/${id}`)} />
      <GameDetailsView details={result.details} />
    </>
  );
}
