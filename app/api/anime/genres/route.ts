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
    const message =
      error instanceof AnimeSourceError && (status === 429 || status === 503)
        ? error.message
        : "Could not load the genre list.";
    if (status >= 500) console.error("[anime/genres]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
