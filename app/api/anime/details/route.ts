import { NextRequest, NextResponse } from "next/server";
import { AniListError } from "@/lib/anilist/client";
import { getAnimeDetails } from "@/lib/anilist/discovery";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const idRaw = request.nextUrl.searchParams.get("id");
  const id = idRaw ? Number(idRaw) : NaN;

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid anime id." }, { status: 400 });
  }

  try {
    const anime = await getAnimeDetails(id);
    if (!anime) {
      return NextResponse.json({ error: "Anime not found." }, { status: 404 });
    }
    return NextResponse.json(anime);
  } catch (error) {
    const status = error instanceof AniListError ? error.status : 500;
    return NextResponse.json({ error: "Could not load anime details." }, { status });
  }
}
