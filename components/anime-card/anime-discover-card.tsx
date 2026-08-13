"use client";

import Link from "next/link";
import { Plus, Star } from "lucide-react";
import { Poster } from "@/components/movie-card/poster";
import { TierPill } from "@/components/movie-card/tier-pill";
import { Badge } from "@/components/ui/badge";
import { ContentTypeBadge } from "@/components/ui/content-type-badge";
import type { AnimeSummary } from "@/lib/types/anime";
import type { RankedTitle } from "@/lib/types";
import { formatEpisodes, formatScore, statusLabel } from "@/lib/utils/anime-format";

interface AnimeDiscoverCardProps {
  anime: AnimeSummary;
  ranked?: RankedTitle;
  onAdd: (anime: AnimeSummary) => void;
}

export function AnimeDiscoverCard({ anime, ranked, onAdd }: AnimeDiscoverCardProps) {
  const href = `/anime/${anime.anilistId}`;

  return (
    <div className="group relative flex flex-col gap-2">
      <Link href={href} className="block">
        <Poster posterPath={anime.coverImage} title={anime.title} className="transition-all duration-200 group-hover:scale-[1.02] group-hover:ring-2 group-hover:ring-accent/40" />
      </Link>

      {ranked ? (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-xs font-medium backdrop-blur">
          Добавлено <TierPill tier={ranked.tier} />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onAdd(anime)}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={`Добавить «${anime.title}» в список`}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      )}

      <div className="flex flex-col gap-1">
        <Link href={href} className="line-clamp-1 break-words text-sm font-medium hover:text-accent">
          {anime.title}
        </Link>
        <div className="flex items-center gap-2 text-xs text-muted">
          <ContentTypeBadge type="anime" />
          <span>{anime.year ?? "—"}</span>
          <span className="flex items-center gap-0.5">
            <Star className="h-3 w-3 fill-accent text-accent" aria-hidden />
            {formatScore(anime.score)}
          </span>
          <span className="hidden sm:inline">{formatEpisodes(anime.episodes)}</span>
        </div>
        <div className="hidden flex-wrap items-center gap-1 sm:flex">
          {anime.status && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {statusLabel(anime.status)}
            </Badge>
          )}
          {anime.genres.slice(0, 2).map((g) => (
            <Badge key={g} variant="outline" className="px-1.5 py-0 text-[10px]">
              {g}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
