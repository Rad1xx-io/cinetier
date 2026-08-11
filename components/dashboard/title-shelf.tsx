import type { ReactNode } from "react";
import { RankedCard } from "@/components/movie-card/ranked-card";
import type { RankedTitle } from "@/lib/types";

interface TitleShelfProps {
  title: string;
  icon?: ReactNode;
  titles: RankedTitle[];
  emptyLabel: string;
}

export function TitleShelf({ title, icon, titles, emptyLabel }: TitleShelfProps) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        {icon}
        {title}
      </h2>
      {titles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
          {emptyLabel}
        </p>
      ) : (
        <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
          {titles.map((t) => (
            <RankedCard key={`${t.mediaType}-${t.tmdbId}`} title={t} />
          ))}
        </div>
      )}
    </section>
  );
}
