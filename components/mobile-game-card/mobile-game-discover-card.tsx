"use client";

import Link from "next/link";
import { Plus, Star } from "lucide-react";
import { Poster } from "@/components/movie-card/poster";
import { TierPill } from "@/components/movie-card/tier-pill";
import { ContentTypeBadge } from "@/components/ui/content-type-badge";
import type { MobileGameSummary } from "@/lib/types/mobile-game";
import type { RankedTitle } from "@/lib/types";
import { releaseYear } from "@/lib/utils/format";

interface MobileGameDiscoverCardProps {
  game: MobileGameSummary;
  ranked?: RankedTitle;
  onAdd: (game: MobileGameSummary) => void;
}

export function MobileGameDiscoverCard({ game, ranked, onAdd }: MobileGameDiscoverCardProps) {
  const href = `/games/mobile/${game.appId}`;

  return (
    <div className="group relative flex flex-col gap-2">
      <Link href={href} className="block">
        <Poster
          posterPath={game.posterPath}
          title={game.title}
          className="transition-transform group-hover:scale-[1.02]"
        />
      </Link>

      {ranked ? (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-xs font-medium backdrop-blur">
          Added <TierPill tier={ranked.tier} />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onAdd(game)}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={`Add “${game.title}” to my list`}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      )}

      <div className="flex flex-col gap-1">
        <Link href={href} className="line-clamp-1 break-words text-sm font-medium hover:text-accent">
          {game.title}
        </Link>
        <div className="flex items-center gap-2 text-xs text-muted">
          <ContentTypeBadge type="mobile_game" />
          <span>{releaseYear(game.releaseDate)}</span>
          {game.score !== null && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-accent text-accent" aria-hidden />
              {game.score.toFixed(1)}
            </span>
          )}
          <span className="hidden sm:inline">{game.isFree ? "Free" : game.price ?? ""}</span>
        </div>
      </div>
    </div>
  );
}
