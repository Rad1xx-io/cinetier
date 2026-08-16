import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { detailMetadata } from "@/lib/seo/detail-metadata";
import { SteamError } from "@/lib/steam/client";
import { getGameDetails } from "@/lib/games/source";
import { GameDetailsView } from "@/components/game-details/game-details-view";
import { GameDetailsError } from "@/components/game-details/game-details-error";

type LoadResult =
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "ok"; details: NonNullable<Awaited<ReturnType<typeof getGameDetails>>> };

async function loadGame(id: string): Promise<LoadResult> {
  const appId = Number(id);
  if (!Number.isFinite(appId)) return { kind: "not-found" };

  try {
    const details = await getGameDetails(appId);
    if (!details) return { kind: "not-found" };
    return { kind: "ok", details };
  } catch (error) {
    if (error instanceof SteamError && error.status === 404) return { kind: "not-found" };
    return { kind: "error" };
  }
}

export async function generateMetadata(props: PageProps<"/games/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const result = await loadGame(id);
  if (result.kind === "ok") {
    return detailMetadata({
      title: result.details.title,
      description: result.details.shortDescription,
      image: result.details.posterPath,
      path: `/games/${id}`,
    });
  }
  return { title: "TierListOnline" };
}

export default async function GameDetailsPage(props: PageProps<"/games/[id]">) {
  const { id } = await props.params;
  const result = await loadGame(id);

  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <GameDetailsError />;

  return <GameDetailsView details={result.details} />;
}
