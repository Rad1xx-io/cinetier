import { NextResponse } from "next/server";
import { AniListError } from "@/lib/anilist/client";
import { getAnimeGenres } from "@/lib/anilist/discovery";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const genres = await getAnimeGenres();
    return NextResponse.json({ genres });
  } catch (error) {
    const status = error instanceof AniListError ? error.status : 500;
    return NextResponse.json({ error: "Could not load the genre list." }, { status });
  }
}
