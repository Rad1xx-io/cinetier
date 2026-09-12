import { NextRequest, NextResponse } from "next/server";
import { AppStoreError } from "@/lib/app-store/client";
import { getMobileGameDetails } from "@/lib/app-store/discovery";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";
import { boundedExternalId } from "@/lib/utils/request-bounds";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "mobile-games");
  if (limited) return limited;

  const appId = boundedExternalId(request.nextUrl.searchParams.get("id"));
  if (appId === null) {
    return NextResponse.json({ error: "Invalid game id." }, { status: 400 });
  }

  try {
    const game = await getMobileGameDetails(appId);
    if (!game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }
    return NextResponse.json(game);
  } catch (error) {
    const status = error instanceof AppStoreError ? error.status : 500;
    return NextResponse.json({ error: "Could not load game details." }, { status });
  }
}
