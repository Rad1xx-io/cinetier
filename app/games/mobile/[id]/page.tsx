import { notFound } from "next/navigation";
import type { Metadata } from "next";
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
  | { kind: "ok"; details: NonNullable<Awaited<ReturnType<typeof getMobileGameDetails>>> };

async function loadGame(id: string): Promise<LoadResult> {
  const appId = Number(id);
  if (!Number.isFinite(appId)) return { kind: "not-found" };

  try {
    const details = await getMobileGameDetails(appId);
    if (!details) return { kind: "not-found" };
    return { kind: "ok", details };
  } catch (error) {
    if (error instanceof AppStoreError && error.status === 404) return { kind: "not-found" };
    return { kind: "error" };
  }
}

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
  if (result.kind === "error") return <MobileGameDetailsError />;

  return (
    <>
      <JsonLd data={mobileGameJsonLd(result.details, `/games/mobile/${id}`)} />
      <MobileGameDetailsView details={result.details} />
    </>
  );
}
