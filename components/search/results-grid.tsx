import { DiscoverCard } from "@/components/movie-card/discover-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { RankedTitle, TitleSummary } from "@/lib/types";
import { titleKey } from "@/lib/storage";

interface ResultsGridProps {
  titles: TitleSummary[];
  rankedByKey: Map<string, RankedTitle>;
  onAdd: (title: TitleSummary) => void;
  loading?: boolean;
}

export function ResultsGrid({ titles, rankedByKey, onAdd, loading }: ResultsGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-2/3" />
        ))}
      </div>
    );
  }

  if (titles.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">Nothing found.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {titles.map((title) => (
        <DiscoverCard
          key={`${title.mediaType}-${title.tmdbId}`}
          title={title}
          ranked={rankedByKey.get(titleKey(title.tmdbId, title.mediaType))}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}
