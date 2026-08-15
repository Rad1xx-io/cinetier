"use client";

import Link from "next/link";
import { Plus, Star } from "lucide-react";
import { Poster } from "@/components/movie-card/poster";
import { TierPill } from "@/components/movie-card/tier-pill";
import { ContentTypeBadge } from "@/components/ui/content-type-badge";
import type { RankedTitle, TitleSummary } from "@/lib/types";
import { formatRating, releaseYear } from "@/lib/utils/format";
import { titleHref } from "@/lib/utils/title-route";

interface DiscoverCardProps {
  title: TitleSummary;
  ranked?: RankedTitle;
  onAdd: (title: TitleSummary) => void;
}

export function DiscoverCard({ title, ranked, onAdd }: DiscoverCardProps) {
  return (
    <div className="group relative flex flex-col gap-2">
      <Link href={titleHref(title.mediaType, title.tmdbId)} className="block">
        <Poster posterPath={title.posterPath} title={title.title} className="transition-all duration-200 group-hover:scale-[1.02] group-hover:ring-2 group-hover:ring-accent/40" />
      </Link>

      {ranked ? (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-xs font-medium backdrop-blur">
          Added <TierPill tier={ranked.tier} />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onAdd(title)}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={`Add “${title.title}” to my list`}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      )}

      <div className="flex flex-col gap-1">
        <Link href={titleHref(title.mediaType, title.tmdbId)} className="line-clamp-1 break-words text-sm font-medium hover:text-accent">
          {title.title}
        </Link>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{releaseYear(title.releaseDate)}</span>
          <ContentTypeBadge type={title.mediaType} />
          <span className="flex items-center gap-0.5">
            <Star className="h-3 w-3 fill-accent text-accent" aria-hidden />
            {formatRating(title.voteAverage)}
          </span>
        </div>
      </div>
    </div>
  );
}
