import { NextRequest, NextResponse } from "next/server";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";
import { boundedCount, boundedPageToken, boundedRegion } from "@/lib/utils/request-bounds";
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
  /*
   * The strictest budget in the app, and the reason the limiter exists.
   * `discoverChannels` below spends a search.list — 100 units of a
   * 10,000-unit day — plus a channels.list per batch, so a hundred unmetered
   * requests would take YouTube off this site until the quota resets. Checked
   * first, before a single parameter is read, so a refused request costs
   * nothing upstream.
   */
  const limited = await rateLimitOrNull(request, "youtube-search");
  if (limited) return limited;

  const searchParams = request.nextUrl.searchParams;
  const query = sanitizeSearchQuery(searchParams.get("query") ?? "") || undefined;
  const country = boundedRegion(searchParams.get("country"));
  const pageToken = boundedPageToken(searchParams.get("pageToken"));
  const minSubscribers = boundedCount(searchParams.get("minSubscribers"), 1_000_000_000);
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
