import type { TierOrUnrated } from "@/lib/types";

/** Normalized shape used for YouTube channel search results. */
export interface ChannelSummary {
  channelId: string;
  title: string;
  handle: string | null;
  description: string;
  thumbnailUrl: string | null;
  country: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  viewCount: number | null;
  publishedAt: string | null;
}

/** Normalized shape used for the channel details page. */
export interface ChannelDetails extends ChannelSummary {
  bannerUrl: string | null;
}

/** The minimal record persisted per channel in local storage — mirrors RankedTitle. */
export interface RankedChannel {
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
  country: string | null;
  tier: TierOrUnrated;
  order: number;
  subscriberCount?: number;
  addedAt: number;
  updatedAt: number;
}

export interface ChannelSearchResponse {
  nextPageToken?: string;
  results: ChannelSummary[];
}

export interface ApiErrorBody {
  error: string;
}
