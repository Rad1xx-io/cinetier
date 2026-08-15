"use client";

import { useState } from "react";
import { ArrowLeft, SkipForward } from "lucide-react";
import { Poster } from "@/components/movie-card/poster";
import { Button } from "@/components/ui/button";
import { TIER_META } from "@/lib/tier-meta";
import { tierColorVar } from "@/lib/utils/tier-style";
import type { Tier } from "@/lib/types";
import type { BattleItem } from "@/lib/types/battle";
import { cn } from "@/lib/utils/cn";

/** Battles are a forced ladder: every rated tier, never "Unrated". */
const BATTLE_TIERS: Tier[] = ["S", "A", "B", "C", "D", "F"];

interface BattleVotingProps {
  items: BattleItem[];
  /** Fires once, when the last item is answered or skipped. */
  onComplete: (ratings: Record<string, string>) => void;
  submitting?: boolean;
}

/**
 * The play half of a battle: one title at a time, six buttons, instant advance.
 *
 * Ratings live here rather than in the parent because nothing above needs to see
 * them until the round ends — the parent re-rendering on every tap would drag
 * the whole page through a state change for what is a single-card decision.
 */
export function BattleVoting({ items, onComplete, submitting = false }: BattleVotingProps) {
  const [index, setIndex] = useState(0);
  const [ratings, setRatings] = useState<Record<string, string>>({});

  const item = items[index];
  const isLast = index === items.length - 1;
  const answered = Object.keys(ratings).length;

  // A battle with no items has nothing to play; the parent guards against this,
  // but rendering `items[0]` of an empty array would crash rather than say so.
  if (!item) return null;

  /**
   * `next` is threaded through explicitly instead of read back from state: on
   * the final item the completion callback runs in the same tick as the state
   * update, and `ratings` would still hold the previous value.
   */
  function advance(next: Record<string, string>) {
    setRatings(next);
    if (isLast) {
      onComplete(next);
      return;
    }
    setIndex((i) => i + 1);
  }

  function handleRate(tier: Tier) {
    advance({ ...ratings, [item.id]: tier });
  }

  function handleSkip() {
    // A skipped item is removed rather than stored as a blank: the calculator
    // scores shared items only, and an empty string would just be dropped later.
    const next = { ...ratings };
    delete next[item.id];
    advance(next);
  }

  const progress = ((index + 1) / items.length) * 100;
  const currentChoice = ratings[item.id];

  return (
    <div className="mx-auto max-w-xl px-4 py-6 md:py-10">
      <div className="mb-5">
        <div className="mb-2 flex items-baseline justify-between text-xs text-muted">
          <span>
            Entry {index + 1} of {items.length}
          </span>
          <span>Rated: {answered}</span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-raised"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={items.length}
          aria-valuenow={index + 1}
          aria-label="Battle progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col items-center text-center">
        <Poster
          posterPath={null}
          fallbackSrc={item.posterUrl ?? null}
          title={item.title}
          size="w342"
          priority
          className="w-40 shadow-2xl sm:w-52"
          sizes="(max-width: 640px) 160px, 208px"
        />
        <h1 className="mt-4 text-balance text-xl font-bold tracking-tight sm:text-2xl">
          {item.title}
        </h1>
        <p className="mt-1 text-xs text-muted">
          {currentChoice ? `You picked ${currentChoice}` : "Pick a tier"}
        </p>
      </div>

      {/* Two rows of three on a phone so every target stays thumb-sized. */}
      <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {BATTLE_TIERS.map((tier) => {
          const active = currentChoice === tier;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => handleRate(tier)}
              disabled={submitting}
              aria-pressed={active}
              aria-label={`${tier} — ${TIER_META[tier].name}`}
              title={TIER_META[tier].description}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl border text-lg font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 sm:h-20",
                active
                  ? "border-transparent text-background"
                  : "border-border text-foreground hover:bg-white/5"
              )}
              style={active ? { backgroundColor: tierColorVar(tier) } : undefined}
            >
              {tier}
              <span
                className={cn(
                  "text-[10px] font-medium leading-none",
                  active ? "opacity-80" : "text-muted"
                )}
              >
                {TIER_META[tier].name}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIndex((i) => i - 1)}
          disabled={index === 0 || submitting}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </Button>

        <Button variant="secondary" size="sm" onClick={handleSkip} disabled={submitting}>
          <SkipForward className="h-3.5 w-3.5" aria-hidden />
          {isLast ? "Skip and finish" : "Skip"}
        </Button>
      </div>

      {isLast && (
        <p className="mt-3 text-center text-xs text-muted">
          This is the last entry — picking a tier finishes the battle.
        </p>
      )}
    </div>
  );
}
