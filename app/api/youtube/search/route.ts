import { NextRequest, NextResponse } from "next/server";
import { sanitizeSearchQuery } from "@/lib/utils/search-query";
import { YouTubeError } from "@/lib/youtube/client";
import { discoverChannels } from "@/lib/youtube/channel-lookup";
import type { ChannelSortMode } from "@/lib/youtube/channel-lookup";
import type { ChannelSearchResponse } from "@/lib/types/youtube";

export const dynamic = "force-dynamic";

const VALID_SORTS: ChannelSortMode[] = [
  "subscribers_desc",
  "subscribers_asc",
  "views_desc",
  "views_asc",
  "newest",
  "title",
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = sanitizeSearchQuery(searchParams.get("query") ?? "") || undefined;
  const country = searchParams.get("country")?.trim() || undefined;
  const pageToken = searchParams.get("pageToken") ?? undefined;
  const minSubscribersRaw = Number(searchParams.get("minSubscribers") ?? 0);
  const minSubscribers = Number.isFinite(minSubscribersRaw) ? minSubscribersRaw : 0;
  const sortRaw = searchParams.get("sort") ?? "subscribers_desc";
  const sort = VALID_SORTS.includes(sortRaw as ChannelSortMode) ? (sortRaw as ChannelSortMode) : "subscribers_desc";

  try {
    const { results, nextPageToken, correctedQuery } = await discoverChannels({
      query,
      country,
      minSubscribers,
      sort,
      pageToken,
    });

    const payload: ChannelSearchResponse = { results, nextPageToken, correctedQuery };
    return NextResponse.json(payload);
  } catch (error) {
    const status = error instanceof YouTubeError ? error.status : 500;
    const message =
      status === 429
        ? "Too many requests. Please try again later."
        : "Could not load channels. Please try again.";
    return NextResponse.json({ error: message }, { status });
  }
}
