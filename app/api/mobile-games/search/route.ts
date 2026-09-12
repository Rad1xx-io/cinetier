import { NextRequest, NextResponse } from "next/server";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";
import { boundedPage } from "@/lib/utils/request-bounds";
import { sanitizeSearchQuery } from "@/lib/utils/search-query";
import { AppStoreError } from "@/lib/app-store/client";
import { discoverMobileGames } from "@/lib/app-store/discovery";
import type { MobileGameSearchResponse } from "@/lib/types/mobile-game";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "mobile-games");
  if (limited) return limited;

  const sp = request.nextUrl.searchParams;
  const query = sanitizeSearchQuery(sp.get("query") ?? "");
  const page = boundedPage(sp.get("page"), true);

  if (!query) {
    const payload: MobileGameSearchResponse = { results: [], hasMore: false };
    return NextResponse.json(payload);
  }

  try {
    const { results, hasMore } = await discoverMobileGames({ query, page });
    const payload: MobileGameSearchResponse = { results, hasMore };
    return NextResponse.json(payload);
  } catch (error) {
    const status = error instanceof AppStoreError ? error.status : 500;
    const message =
      status === 429
        ? "The App Store catalogue is rate-limiting us. Try again in a few minutes."
        : "Could not load mobile games. Please try again.";
    return NextResponse.json({ error: message }, { status });
  }
}
