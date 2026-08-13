import { GameDiscoverCard } from "@/components/game-card/game-discover-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { GameSummary } from "@/lib/types/game";
import type { RankedTitle } from "@/lib/types";
import { titleKey } from "@/lib/storage";

interface GamesResultsGridProps {
  results: GameSummary[];
  rankedByKey: Map<string, RankedTitle>;
  onAdd: (game: GameSummary) => void;
  loading?: boolean;
}

export function GamesResultsGrid({ results, rankedByKey, onAdd, loading }: GamesResultsGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-2/3" />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">Игры не найдены.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {results.map((game) => (
        <GameDiscoverCard
          key={game.appId}
          game={game}
          ranked={rankedByKey.get(titleKey(game.appId, "game"))}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}
