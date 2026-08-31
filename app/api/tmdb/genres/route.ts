import { NextRequest, NextResponse } from "next/server";
import { TMDBError } from "@/lib/tmdb/client";
import { getGenreVocabulary } from "@/lib/tmdb/genres";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "reference");
  if (limited) return limited;

  try {
    const genres = await getGenreVocabulary();
    // The ids are an implementation detail of the discover query; the filter UI
    // only ever needs something to show and something to put in the url.
    return NextResponse.json({
      genres: genres.map((g) => ({ slug: g.slug, label: g.label })),
    });
  } catch (error) {
    const status = error instanceof TMDBError ? error.status : 500;
    return NextResponse.json({ error: "Could not load the genre list." }, { status });
  }
}
