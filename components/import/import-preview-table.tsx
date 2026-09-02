"use client";

import { Star } from "lucide-react";
import { Poster } from "@/components/movie-card/poster";
import { QuickTierMenu } from "@/components/tier-list/quick-tier-menu";
import { TIER_META } from "@/lib/tier-meta";
import type { MatchedRow } from "@/lib/import/types";
import type { Tier } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

export interface PreviewEntry {
  row: MatchedRow;
  /** Ignored for a row with no match at all — there is nothing to include. */
  included: boolean;
}

interface ImportPreviewTableProps {
  entries: PreviewEntry[];
  onToggle: (index: number) => void;
  onChangeTier: (index: number, tier: Tier) => void;
}

const CONFIDENCE_LABEL: Record<MatchedRow["confidence"], string> = {
  exact: "Matched",
  likely: "Matched",
  uncertain: "Needs a look",
  "not-found": "Not found on TMDB",
};

/**
 * Why a row is worth a second glance before it gets checked, spelled out
 * rather than left as an unexplained badge — see lib/import/match.ts for
 * how each level is actually decided.
 */
const CONFIDENCE_HINT: Partial<Record<MatchedRow["confidence"], string>> = {
  likely: "Release year is close but not exact.",
  uncertain: "Best guess — title or year did not line up closely. Check before including it.",
};

/** Letterboxd's own half-star rating, read back at a glance rather than as a bare number. */
function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400" title={`${rating} / 5`}>
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < full;
        const isHalf = !filled && i === full && half;
        return (
          <Star
            key={i}
            className={cn("h-3 w-3", !filled && !isHalf && "text-muted/40")}
            fill={filled || isHalf ? "currentColor" : "none"}
            style={isHalf ? { clipPath: "inset(0 50% 0 0)" } : undefined}
          />
        );
      })}
    </span>
  );
}

export function ImportPreviewTable({ entries, onToggle, onChangeTier }: ImportPreviewTableProps) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {entries.map(({ row, included }, index) => {
        const writable = row.match !== null && !row.alreadyRanked;
        return (
          <li
            key={`${row.source.title}-${row.source.year}-${index}`}
            className={cn(
              "flex items-center gap-3 px-3 py-2 text-sm",
              !writable && "opacity-60"
            )}
          >
            <input
              type="checkbox"
              checked={writable && included}
              disabled={!writable}
              onChange={() => onToggle(index)}
              aria-label={`Include “${row.source.title}”`}
              className="h-4 w-4 shrink-0 rounded border-border disabled:cursor-not-allowed"
            />

            <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-surface-raised">
              {row.match && (
                <Poster
                  posterPath={row.match.posterPath}
                  title={row.match.title}
                  sizes="40px"
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {row.match ? row.match.title : row.source.title}
                {row.match?.releaseDate && (
                  <span className="ml-1 font-normal text-muted">
                    ({row.match.releaseDate.slice(0, 4)})
                  </span>
                )}
              </p>
              {row.source.title !== row.match?.title && (
                <p className="truncate text-xs text-muted">
                  Letterboxd: “{row.source.title}”{row.source.year ? ` (${row.source.year})` : ""}
                </p>
              )}
              <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                <StarRating rating={row.source.rating} />
                <span
                  className={cn(
                    "text-muted",
                    row.confidence === "uncertain" && "text-tier-s",
                    row.confidence === "not-found" && "text-muted"
                  )}
                >
                  {row.alreadyRanked ? "Already in your list — skipped" : CONFIDENCE_LABEL[row.confidence]}
                  {CONFIDENCE_HINT[row.confidence] && !row.alreadyRanked
                    ? ` — ${CONFIDENCE_HINT[row.confidence]}`
                    : ""}
                </span>
              </p>
            </div>

            {writable && (
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className="hidden text-[10px] text-muted sm:inline"
                  title={TIER_META[row.tier].description}
                >
                  {TIER_META[row.tier].name}
                </span>
                <QuickTierMenu
                  currentTier={row.tier}
                  label={row.match?.title ?? row.source.title}
                  // "Unrated" is deliberately not offered here: every row
                  // this table shows came from a real Letterboxd rating, so
                  // downgrading it to "not ranked yet" would throw away the
                  // one piece of information the import exists to carry
                  // over. QuickTierMenu still renders the option (it is one
                  // shared component, not rebuilt for this table); this
                  // callback is what keeps it inert here.
                  onSelect={(tier) => tier !== "Unrated" && onChangeTier(index, tier)}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
