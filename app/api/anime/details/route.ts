import { NextRequest, NextResponse } from "next/server";
import { AnimeSourceError, getAnimeSource } from "@/lib/anime-sources";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "details");
  if (limited) return limited;

  const idRaw = request.nextUrl.searchParams.get("id");
  const id = idRaw ? Number(idRaw) : NaN;

  if (!Number.isFinite(id)) {
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
    const message =
      error instanceof AnimeSourceError && (status === 429 || status === 503)
        ? error.message
        : "Could not load anime details.";
    if (status >= 500) console.error("[anime/details]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
