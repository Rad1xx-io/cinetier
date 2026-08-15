import { NextRequest, NextResponse } from "next/server";
import { tmdbFetch, TMDBError } from "@/lib/tmdb/client";
import { mapToSummary } from "@/lib/tmdb/mappers";
import type { TMDBPagedResponse, TMDBRawMovie, TMDBRawTVShow } from "@/lib/tmdb/types";
import type { SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get("type") === "tv" ? "tv" : "movie";
  const page = Number(searchParams.get("page") ?? "1") || 1;

  try {
    let payload: SearchResponse;

    if (type === "tv") {
      const data = await tmdbFetch<TMDBPagedResponse<TMDBRawTVShow>>("/tv/popular", { page });
      payload = {
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        results: data.results.map((r) => mapToSummary(r, "tv")),
      };
    } else {
      const data = await tmdbFetch<TMDBPagedResponse<TMDBRawMovie>>("/movie/popular", { page });
      payload = {
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        results: data.results.map((r) => mapToSummary(r, "movie")),
      };
    }

    return NextResponse.json(payload);
  } catch (error) {
    const status = error instanceof TMDBError ? error.status : 500;
    return NextResponse.json(
      { error: "Could not load popular titles. Please try again." },
      { status }
    );
  }
}
