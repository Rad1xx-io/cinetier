import type { ChannelDetails, ChannelSummary } from "@/lib/types/youtube";
import type { YouTubeChannelItem, YouTubeThumbnails } from "@/lib/youtube/types";

function bestThumbnail(thumbnails: YouTubeThumbnails | undefined): string | null {
  return thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null;
}

function parseCount(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** channels.list items already carry everything we need for both search results and details. */
function normalizeHandle(customUrl: string | undefined): string | null {
  if (!customUrl) return null;
  return customUrl.startsWith("@") ? customUrl : `@${customUrl}`;
}

/** channels.list items already carry everything we need for both search results and details. */
export function mapChannelToSummary(raw: YouTubeChannelItem): ChannelSummary {
  return {
    channelId: raw.id,
    title: raw.snippet.title,
    handle: normalizeHandle(raw.snippet.customUrl),
    description: raw.snippet.description ?? "",
    thumbnailUrl: bestThumbnail(raw.snippet.thumbnails),
    country: raw.snippet.country ?? null,
    subscriberCount: raw.statistics?.hiddenSubscriberCount
      ? null
      : parseCount(raw.statistics?.subscriberCount),
    videoCount: parseCount(raw.statistics?.videoCount),
    viewCount: parseCount(raw.statistics?.viewCount),
    publishedAt: raw.snippet.publishedAt ?? null,
  };
}

export function mapChannelToDetails(raw: YouTubeChannelItem): ChannelDetails {
  return {
    ...mapChannelToSummary(raw),
    bannerUrl: raw.brandingSettings?.image?.bannerExternalUrl ?? null,
  };
}
