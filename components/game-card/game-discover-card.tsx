"use client";

import Link from "next/link";
import { Plus, Star } from "lucide-react";
import { Poster } from "@/components/movie-card/poster";
import { TierPill } from "@/components/movie-card/tier-pill";
import { Badge } from "@/components/ui/badge";
import { ContentTypeBadge } from "@/components/ui/content-type-badge";
import type { GameSummary } from "@/lib/types/game";
import type { RankedTitle } from "@/lib/types";
import { releaseYear } from "@/lib/utils/format";

interface GameDiscoverCardProps {
  game: GameSummary;
  ranked?: RankedTitle;
  onAdd: (game: GameSummary) => void;
}

export function GameDiscoverCard({ game, ranked, onAdd }: GameDiscoverCardProps) {
  const href = `/games/${game.appId}`;

  return (
    <div className="group relative flex flex-col gap-2">
      <Link href={href} className="block">
        <Poster
          posterPath={game.posterPath}
          fallbackSrc={game.fallbackImage}
          title={game.title}
          className="transition-transform group-hover:scale-[1.02]"
        />
      </Link>

      {ranked ? (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-xs font-medium backdrop-blur">
          Добавлено <TierPill tier={ranked.tier} />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onAdd(game)}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={`Добавить «${game.title}» в список`}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      )}

      <div className="flex flex-col gap-1">
        <Link href={href} className="line-clamp-1 break-words text-sm font-medium hover:text-accent">
          {game.title}
        </Link>
        <div className="flex items-center gap-2 text-xs text-muted">
          <ContentTypeBadge type="game" />
          <span>{releaseYear(game.releaseDate)}</span>
          {game.score !== null && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-accent text-accent" aria-hidden />
              {game.score.toFixed(1)}
            </span>
          )}
          <span className="hidden sm:inline">{game.isFree ? "Бесплатно" : game.price ?? ""}</span>
        </div>
        {game.genres.length > 0 && (
          <div className="hidden flex-wrap items-center gap-1 sm:flex">
            {game.genres.slice(0, 2).map((g) => (
              <Badge key={g} variant="outline" className="px-1.5 py-0 text-[10px]">
                {g}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
