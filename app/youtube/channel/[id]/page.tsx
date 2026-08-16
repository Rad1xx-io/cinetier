import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { detailMetadata } from "@/lib/seo/detail-metadata";
import { youtubeFetch, YouTubeError } from "@/lib/youtube/client";
import { mapChannelToDetails } from "@/lib/youtube/mappers";
import type { YouTubeChannelsResponse } from "@/lib/youtube/types";
import { ChannelDetailsView } from "@/components/youtube-channel-details/channel-details-view";
import { ChannelDetailsError } from "@/components/youtube-channel-details/channel-details-error";

type LoadResult =
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "ok"; details: ReturnType<typeof mapChannelToDetails> };

async function loadChannel(id: string): Promise<LoadResult> {
  try {
    const data = await youtubeFetch<YouTubeChannelsResponse>("/channels", {
      part: "snippet,statistics,brandingSettings",
      id,
    });
    const item = data.items[0];
    if (!item) return { kind: "not-found" };
    return { kind: "ok", details: mapChannelToDetails(item) };
  } catch (error) {
    if (error instanceof YouTubeError && error.status === 404) return { kind: "not-found" };
    return { kind: "error" };
  }
}

export async function generateMetadata(props: PageProps<"/youtube/channel/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const result = await loadChannel(id);
  if (result.kind === "ok") {
    return detailMetadata({
      title: result.details.title,
      description: result.details.description,
      image: result.details.thumbnailUrl,
      path: `/youtube/channel/${id}`,
    });
  }
  return { title: "TierListOnline" };
}

export default async function ChannelDetailsPage(props: PageProps<"/youtube/channel/[id]">) {
  const { id } = await props.params;
  const result = await loadChannel(id);

  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <ChannelDetailsError />;

  return <ChannelDetailsView details={result.details} />;
}
