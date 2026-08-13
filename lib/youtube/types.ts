/** Raw shapes returned by the YouTube Data API v3 (subset of fields we actually use). */

export interface YouTubeThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface YouTubeThumbnails {
  default?: YouTubeThumbnail;
  medium?: YouTubeThumbnail;
  high?: YouTubeThumbnail;
}

export interface YouTubeSearchItem {
  id: { kind: string; channelId?: string };
  snippet: {
    title: string;
    description: string;
    thumbnails: YouTubeThumbnails;
    publishedAt: string;
  };
}

export interface YouTubeSearchResponse {
  nextPageToken?: string;
  items: YouTubeSearchItem[];
}

export interface YouTubeChannelItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: YouTubeThumbnails;
    country?: string;
    publishedAt: string;
    customUrl?: string;
  };
  statistics?: {
    subscriberCount?: string;
    videoCount?: string;
    viewCount?: string;
    hiddenSubscriberCount?: boolean;
  };
  brandingSettings?: {
    image?: { bannerExternalUrl?: string };
  };
}

export interface YouTubeChannelsResponse {
  items: YouTubeChannelItem[];
}

export interface YouTubeVideoItem {
  snippet: { channelId: string };
}

export interface YouTubeVideosResponse {
  items: YouTubeVideoItem[];
}

export interface YouTubeErrorResponse {
  error: { code: number; message: string };
}
