"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Poster } from "@/components/movie-card/poster";
import { TIERS, type Tier } from "@/lib/types";
import type { VotingPoolItem, VotingRatings } from "@/lib/types/voting";
import { tierColorVar } from "@/lib/utils/tier-style";
import { cn } from "@/lib/utils/cn";

interface VotingBallotProps {
  pool: VotingPoolItem[];
  submitting: boolean;
  onSubmit: (ratings: VotingRatings) => void;
}

/**
 * One tier per pool item, on the browser's own single pass — no comparison
 * against anyone else's answers, unlike Battle's voting screen, because
 * there is no "the creator's own ranking" here to be measured against.
 * Partial is allowed: a card left unrated simply is not counted (migration
 * 033's aggregation only ever reads the six real tier letters).
 */
export function VotingBallot({ pool, submitting, onSubmit }: VotingBallotProps) {
  const [ratings, setRatings] = useState<VotingRatings>({});

  const ratedCount = Object.keys(ratings).length;

  function rate(itemKey: string, tier: Tier) {
    setRatings((prev) => ({ ...prev, [itemKey]: tier }));
  }

  return (
    <div>
      <p className="text-xs text-muted">
        {ratedCount} of {pool.length} rated. You do not have to rate every one.
      </p>

      <ul className="mt-2 space-y-1.5">
        {pool.map((item) => {
          const tier = ratings[item.itemKey];
          return (
            <li key={item.itemKey}>
              <div className="flex items-center gap-2.5 rounded-lg border border-border p-1.5">
                <Poster
                  posterPath={null}
                  fallbackSrc={item.posterPath}
                  title={item.title}
                  className="w-9 shrink-0"
                  sizes="36px"
                />
                <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                <span className="flex shrink-0 gap-0.5" role="group" aria-label={`Rate “${item.title}”`}>
                  {TIERS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => rate(item.itemKey, t)}
                      aria-pressed={tier === t}
                      aria-label={`${item.title}: ${t}`}
                      className={cn(
                        "flex h-7 w-6 items-center justify-center rounded border text-[11px] font-bold transition-colors",
                        tier === t
                          ? "border-transparent text-background"
                          : "border-border text-muted hover:text-foreground"
                      )}
                      style={tier === t ? { backgroundColor: tierColorVar(t) } : undefined}
                    >
                      {t}
                    </button>
                  ))}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <Button
        className="mt-4 w-full"
        disabled={submitting || ratedCount === 0}
        onClick={() => onSubmit(ratings)}
      >
        {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        Submit ballot
      </Button>
    </div>
  );
}
