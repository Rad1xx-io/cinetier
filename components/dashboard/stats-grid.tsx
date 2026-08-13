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
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        <StatTile label="Всего в списке" value={titles.length} className="col-span-2 sm:col-span-1" />
        <StatTile label="Оценено" value={rated.length} />
        <StatTile label="Не оценено" value={unrated} />
        <StatTile label="Фильмы" value={movies} />
        <StatTile label="Сериалы" value={tvShows} />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {tierCounts.map(({ tier, count }) => (
          <StatTile
            key={tier}
            label={`Тир ${tier}`}
            title={TIER_META[tier].name}
            value={count}
            accent={tierColorVar(tier)}
          />
        ))}
      </div>
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
