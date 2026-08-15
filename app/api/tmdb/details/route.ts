import { NextRequest, NextResponse } from "next/server";
import { tmdbFetch, TMDBError } from "@/lib/tmdb/client";
import { mapToDetails } from "@/lib/tmdb/mappers";
import type { TMDBRawMovie, TMDBRawTVShow } from "@/lib/tmdb/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");
  const type = searchParams.get("type") === "tv" ? "tv" : "movie";

  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid title id." }, { status: 400 });
  }

  try {
    if (type === "tv") {
      const raw = await tmdbFetch<TMDBRawTVShow>(`/tv/${id}`);
      return NextResponse.json(mapToDetails(raw, "tv"));
    }
    const raw = await tmdbFetch<TMDBRawMovie>(`/movie/${id}`);
    return NextResponse.json(mapToDetails(raw, "movie"));
  } catch (error) {
    const status = error instanceof TMDBError ? error.status : 500;
    const message = status === 404 ? "Title not found." : "Could not load title details.";
    return NextResponse.json({ error: message }, { status });
  }
}
