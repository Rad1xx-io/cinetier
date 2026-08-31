import { NextRequest, NextResponse } from "next/server";
import { youtubeFetch, YouTubeError } from "@/lib/youtube/client";
import { mapChannelToDetails } from "@/lib/youtube/mappers";
import type { YouTubeChannelsResponse } from "@/lib/youtube/types";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "details");
  if (limited) return limited;

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Invalid channel id." }, { status: 400 });
  }

  try {
    const data = await youtubeFetch<YouTubeChannelsResponse>("/channels", {
      part: "snippet,statistics,brandingSettings",
      id,
    });

    const item = data.items[0];
    if (!item) {
      return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }

    return NextResponse.json(mapChannelToDetails(item));
  } catch (error) {
    const status = error instanceof YouTubeError ? error.status : 500;
    return NextResponse.json(
      { error: "Could not load channel details." },
      { status }
    );
  }
}
