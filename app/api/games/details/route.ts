import { NextRequest, NextResponse } from "next/server";
import { SteamError } from "@/lib/steam/client";
import { getGameDetails } from "@/lib/games/source";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";
import { boundedExternalId } from "@/lib/utils/request-bounds";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "details");
  if (limited) return limited;

  // See the note in the anime route: a finite number is not the same as a
  // plausible app id, and Steam was being asked about both.
  const appId = boundedExternalId(request.nextUrl.searchParams.get("id"));

  if (appId === null) {
    return NextResponse.json({ error: "Invalid game id." }, { status: 400 });
  }

  try {
    const game = await getGameDetails(appId);
    if (!game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }
    return NextResponse.json(game);
  } catch (error) {
    const status = error instanceof SteamError ? error.status : 500;
    return NextResponse.json({ error: "Could not load game details." }, { status });
  }
}
