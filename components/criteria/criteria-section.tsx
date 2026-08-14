"use client";

import { useCallback, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CriteriaDrawer } from "@/components/criteria/criteria-drawer";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import { useLazyCriteria } from "@/lib/hooks/use-lazy-criteria";
import { pullCriteria, pushCriteria } from "@/lib/storage/criteria-sync";
import type { MediaType } from "@/lib/types";
import { criteriaAverage, type CriterionScore } from "@/lib/types/criteria";
import { trackCriterionRated } from "@/lib/analytics/events";

interface CriteriaSectionProps {
  tmdbId: number;
  mediaType: MediaType;
  /** Only ranked items can carry a breakdown — there is nothing to attach it to otherwise. */
  isRanked: boolean;
  criteriaScores: CriterionScore[] | undefined;
  /**
   * Someone else's list. Shows the numbers, offers no way to change them —
   * a visitor has no rating of their own here to attach a breakdown to.
   */
  readOnly?: boolean;
}

/**
 * The "Add / Edit criteria" control and the summary of what was saved.
 *
 * Dropped into each details view rather than reimplemented per catalog: films,
 * anime and games all rank through RankedTitle, so they all break down the same
 * way. Channels are a separate store and deliberately excluded.
 */
export function CriteriaSection({
  tmdbId,
  mediaType,
  isRanked,
  criteriaScores,
  readOnly = false,
}: CriteriaSectionProps) {
  const { setCriteria } = useRankedTitles();
  const { user } = useSupabaseSession();
  const [open, setOpen] = useState(false);

  const handleLoaded = useCallback(
    (scores: CriterionScore[]) => {
      // Written straight into the store rather than component state, so the
      // answer survives closing the card and every other view sees it too.
      setCriteria(tmdbId, mediaType, scores);
    },
    [setCriteria, tmdbId, mediaType]
  );

  /**
   * A breakdown lives in its own table, so the bulk sync that pulls whole lists
   * cannot carry it — one query per title would make signing in as slow as the
   * longest list. It is fetched when a card is actually opened instead.
   */
  useLazyCriteria({
    tmdbId,
    mediaType,
    userId: readOnly ? null : (user?.id ?? null),
    isOpen: isRanked,
    hasLocalScores: (criteriaScores?.length ?? 0) > 0,
    pull: pullCriteria,
    onLoaded: handleLoaded,
  });

  const average = criteriaAverage(criteriaScores);
  const count = criteriaScores?.length ?? 0;

  // A visitor's view of a title nobody scored has nothing to say; the owner's
  // still needs the button that creates the first one.
  if (!isRanked) return null;
  if (readOnly && count === 0) return null;

  function handleSave(scores: CriterionScore[]) {
    // Local first, exactly like every other write in the app: the UI updates
    // synchronously and the cloud catches up in the background, so a failed or
    // absent connection never blocks saving.
    setCriteria(tmdbId, mediaType, scores);
    setOpen(false);
    if (user) void pushCriteria(user.id, tmdbId, mediaType, scores);

    // Reported on save rather than on every slider move: dragging a slider
    // fires continuously, and a hundred events for one decision would drown the
    // funnel in noise while telling you nothing extra.
    const itemId = `${mediaType}-${tmdbId}`;
    for (const criterion of scores) {
      trackCriterionRated(itemId, criterion.name, criterion.score);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            {count > 0 ? "Изменить критерии" : "Добавить критерии"}
          </Button>
        )}

        {average !== null && (
          <p className="text-sm text-muted">
            {readOnly ? "Оценка по критериям:" : "Своя оценка:"}{" "}
            <span className="font-semibold text-accent">{average.toFixed(1)}</span>
            <span className="text-muted"> · {count} крит.</span>
          </p>
        )}
      </div>

      {count > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {criteriaScores!.map((c) => (
            <span
              key={c.criterionId}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted"
            >
              {c.name} <span className="text-foreground">{c.score.toFixed(1)}</span>
            </span>
          ))}
        </div>
      )}

      {!readOnly && (
        <CriteriaDrawer
          isOpen={open}
          onClose={() => setOpen(false)}
          onSave={handleSave}
          initialScores={criteriaScores}
        />
      )}
    </div>
  );
}
