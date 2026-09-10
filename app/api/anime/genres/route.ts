import { NextRequest, NextResponse } from "next/server";
import { AnimeSourceError, getAnimeSource } from "@/lib/anime-sources";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "reference");
  if (limited) return limited;

  try {
    const genres = await getAnimeSource().getGenres();
    return NextResponse.json({ genres });
  } catch (error) {
    const status = error instanceof AnimeSourceError ? error.status : 500;
    // Logged unconditionally, not just at status >= 500: AniList's own
    // self-disable answers 403, and that outage (2026-09-08) left nothing in
    // the logs under the old `>= 500` gate — a real incident, invisible the
    // whole time it was happening. Reaching this catch at all means the
    // source failed one way or another; that is always worth a trace.
    console.error("[anime/genres]", error);
    const message =
      error instanceof AnimeSourceError
        ? status === 429 || status === 503
          ? // The upstream's own wording, for the two states a user can act
            // on — rate limited, catalogue down — because "try again" and
            // "try again in an hour" are different instructions.
            error.message
          : "The anime catalogue's data source is unavailable right now. Please try again later."
        : "Could not load the genre list.";
    return NextResponse.json({ error: message }, { status });
  }
}
