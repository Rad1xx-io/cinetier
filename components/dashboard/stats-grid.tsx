import { TIERS } from "@/lib/types";
import { TIER_META } from "@/lib/tier-meta";
import { tierColorVar } from "@/lib/utils/tier-style";
import type { RankedTitle } from "@/lib/types";

export function StatsGrid({ titles }: { titles: RankedTitle[] }) {
  const rated = titles.filter((t) => t.tier !== "Unrated");
  const unrated = titles.length - rated.length;
  const movies = titles.filter((t) => t.mediaType === "movie").length;
  const tvShows = titles.filter((t) => t.mediaType === "tv").length;
  const tierCounts = TIERS.map((tier) => ({
    tier,
    count: titles.filter((t) => t.tier === tier).length,
  }));

  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-4 md:grid-cols-8">
      <StatTile label="Оценено" value={rated.length} className="col-span-2 md:col-span-2" />
      <StatTile label="Не оценено" value={unrated} className="col-span-2 md:col-span-2" />
      <StatTile label="Фильмы" value={movies} className="col-span-2 md:col-span-2" />
      <StatTile label="Сериалы" value={tvShows} className="col-span-2 md:col-span-2" />
      {tierCounts.map(({ tier, count }) => (
        <StatTile
          key={tier}
          label={`Тир ${tier}`}
          title={TIER_META[tier].name}
          value={count}
          accent={tierColorVar(tier)}
          className="col-span-1 sm:col-span-1"
        />
      ))}
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
  className,
  title,
}: {
  label: string;
  value: number;
  accent?: string;
  className?: string;
  title?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-3 ${className ?? ""}`} title={title}>
      <p className="text-2xl font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}
