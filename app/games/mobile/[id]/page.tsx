import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogueGate } from "@/lib/rate-limit/limiter";
import { CatalogueBusy } from "@/components/media/catalogue-busy";
import { detailMetadata } from "@/lib/seo/detail-metadata";
import { mobileGameJsonLd } from "@/lib/seo/json-ld";
import { JsonLd } from "@/components/seo/json-ld";
import { AppStoreError } from "@/lib/app-store/client";
import { getMobileGameDetails } from "@/lib/app-store/discovery";
import { MobileGameDetailsView } from "@/components/mobile-game-details/mobile-game-details-view";
import { MobileGameDetailsError } from "@/components/mobile-game-details/mobile-game-details-error";

type LoadResult =
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "busy" }
  | { kind: "ok"; details: NonNullable<Awaited<ReturnType<typeof getMobileGameDetails>>> };

const loadGame = cache(async (id: string): Promise<LoadResult> => {
  const appId = Number(id);
  if (!Number.isFinite(appId)) return { kind: "not-found" };

  // Metered before the upstream call, and after the free check above so a
  // malformed id costs nobody anything. Gated on "mobile-games", not the
  // shared "details" tier title/anime/youtube/PC games use — this page's
  // sibling route (/api/mobile-games/details) already meters itself against
  // "mobile-games" specifically, because iTunes' own budget is far tighter
  // than TMDB/AniList/Steam-IGDB's (see lib/app-store/client.ts). Gating
  // this page on the generic "details" tier instead would draw from a
  // different bucket than that sibling route, which is exactly the loophole
  // catalogueGate exists to close — see its own header.
  if (await catalogueGate("mobile-games")) return { kind: "busy" };

  try {
    const details = await getMobileGameDetails(appId);
    if (!details) return { kind: "not-found" };
    return { kind: "ok", details };
  } catch (error) {
    if (error instanceof AppStoreError && error.status === 404) return { kind: "not-found" };
    return { kind: "error" };
  }
});

export async function generateMetadata(props: PageProps<"/games/mobile/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const result = await loadGame(id);
  if (result.kind === "ok") {
    return detailMetadata({
      title: result.details.title,
      description: result.details.shortDescription,
      image: result.details.posterPath,
      path: `/games/mobile/${id}`,
    });
  }
  return { title: "TierListOnline" };
}

export default async function MobileGameDetailsPage(props: PageProps<"/games/mobile/[id]">) {
  const { id } = await props.params;
  const result = await loadGame(id);

  if (result.kind === "not-found") notFound();
  if (result.kind === "busy")
    return <CatalogueBusy backHref="/games/mobile" backLabel="Back to browsing" />;
  if (result.kind === "error") return <MobileGameDetailsError />;

  return (
    <>
      <JsonLd data={mobileGameJsonLd(result.details, `/games/mobile/${id}`)} />
      <MobileGameDetailsView details={result.details} />
    </>
  );
}
