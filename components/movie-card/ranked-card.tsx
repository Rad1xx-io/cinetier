import Link from "next/link";
import { Poster } from "@/components/movie-card/poster";
import { TierPill } from "@/components/movie-card/tier-pill";
import type { RankedTitle } from "@/lib/types";
import { releaseYear } from "@/lib/utils/format";
import { titleHref } from "@/lib/utils/title-route";

export function RankedCard({ title }: { title: RankedTitle }) {
  return (
    <Link href={titleHref(title.mediaType, title.tmdbId)} className="flex w-28 shrink-0 flex-col gap-2 sm:w-32">
      <div className="relative">
        <Poster posterPath={title.posterPath} title={title.title} className="transition-transform hover:scale-[1.02]" />
        <TierPill tier={title.tier} className="absolute left-1.5 top-1.5 shadow" />
      </div>
      <div>
        <p className="line-clamp-1 break-words text-xs font-medium">{title.title}</p>
        <p className="text-[11px] text-muted">{releaseYear(title.releaseDate)}</p>
      </div>
    </Link>
  );
}
