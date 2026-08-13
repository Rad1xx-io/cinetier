import { AnimeDiscoverCard } from "@/components/anime-card/anime-discover-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnimeSummary } from "@/lib/types/anime";
import type { RankedTitle } from "@/lib/types";
import { titleKey } from "@/lib/storage";

interface AnimeResultsGridProps {
  results: AnimeSummary[];
  rankedByKey: Map<string, RankedTitle>;
  onAdd: (anime: AnimeSummary) => void;
  loading?: boolean;
}

export function AnimeResultsGrid({ results, rankedByKey, onAdd, loading }: AnimeResultsGridProps) {
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
    return <p className="py-10 text-center text-sm text-muted">По этим фильтрам аниме не найдено.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {results.map((anime) => (
        <AnimeDiscoverCard
          key={anime.anilistId}
          anime={anime}
          ranked={rankedByKey.get(titleKey(anime.anilistId, "anime"))}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}
