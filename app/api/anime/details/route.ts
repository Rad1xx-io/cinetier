import { NextRequest, NextResponse } from "next/server";
import { AnimeSourceError, getAnimeSource } from "@/lib/anime-sources";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";
import { boundedExternalId } from "@/lib/utils/request-bounds";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "details");
  if (limited) return limited;

  // `Number.isFinite` alone accepted -1, 1.5 and 1e300, each of which became
  // an upstream request that could only ever fail.
  const id = boundedExternalId(request.nextUrl.searchParams.get("id"));

  if (id === null) {
    return NextResponse.json({ error: "Invalid anime id." }, { status: 400 });
  }

  try {
    const anime = await getAnimeSource().getDetails(id);
    if (!anime) {
      return NextResponse.json({ error: "Anime not found." }, { status: 404 });
    }
    return NextResponse.json(anime);
  } catch (error) {
    const status = error instanceof AnimeSourceError ? error.status : 500;
    // A missing id is an answer, not a fault — the source raises 404 when it is
    // configured not to swallow one, and the client gets the same shape either way.
    if (status === 404) {
      return NextResponse.json({ error: "Anime not found." }, { status: 404 });
    }
    // Logged unconditionally, not just at status >= 500: AniList's own
    // self-disable answers 403, and that outage (2026-09-08) left nothing in
    // the logs under the old `>= 500` gate — a real incident, invisible the
    // whole time it was happening. Reaching this point at all (the 404 above
    // already returned) means the source failed one way or another; that is
    // always worth a trace.
    console.error("[anime/details]", error);
    const message =
      error instanceof AnimeSourceError
        ? status === 429 || status === 503
          ? // The upstream's own wording, for the two states a user can act
            // on — rate limited, catalogue down — because "try again" and
            // "try again in an hour" are different instructions.
            error.message
          : "The anime catalogue's data source is unavailable right now. Please try again later."
        : "Could not load anime details.";
    return NextResponse.json({ error: message }, { status });
  }
}
