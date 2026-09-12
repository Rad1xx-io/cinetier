import { MobileGameDiscoverCard } from "@/components/mobile-game-card/mobile-game-discover-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MobileGameSummary } from "@/lib/types/mobile-game";
import type { RankedTitle } from "@/lib/types";
import { titleKey } from "@/lib/storage";

interface MobileGamesResultsGridProps {
  results: MobileGameSummary[];
  rankedByKey: Map<string, RankedTitle>;
  onAdd: (game: MobileGameSummary) => void;
  loading?: boolean;
  searched: boolean;
}

export function MobileGamesResultsGrid({
  results,
  rankedByKey,
  onAdd,
  loading,
  searched,
}: MobileGamesResultsGridProps) {
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
    return (
      <p className="py-10 text-center text-sm text-muted">
        {searched ? "No mobile games found." : "Search for a game to get started."}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {results.map((game) => (
        <MobileGameDiscoverCard
          key={game.appId}
          game={game}
          ranked={rankedByKey.get(titleKey(game.appId, "mobile_game"))}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}
