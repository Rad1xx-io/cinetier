"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Swords, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BattleVoting } from "@/components/battle/battle-voting";
import { BattleResults } from "@/components/battle/battle-results";
import { BattleOwnerView } from "@/components/battle/battle-owner-view";
import { getBattle, submitBattleResult, type Battle } from "@/lib/supabase/battles";
import { trackEvent } from "@/lib/analytics/tracker";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import type { BattleComparison } from "@/lib/types/battle";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; battle: Battle };

/**
 * Owns the two halves of a battle and the transition between them.
 *
 * The pool is fetched client-side for the same reason the public tier list is:
 * `getBattle` speaks to the browser Supabase client, and the row is readable by
 * link with or without a session, so there is nothing a server round-trip would
 * add beyond a slower first paint.
 */
export function BattleView({ battleId }: { battleId: string }) {
  const { user } = useSupabaseSession();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    comparison: BattleComparison;
    ratings: Record<string, string>;
  } | null>(null);

  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBattle(battleId)
      .then((battle) => {
        if (cancelled) return;
        setState(battle ? { status: "ready", battle } : { status: "missing" });

        // Counted once the pool is actually on screen and playable. Firing on
        // mount would count every dead link as a started battle, and the ref
        // keeps a re-render or a Strict Mode double-effect from doubling it.
        if (battle && startedRef.current !== battleId) {
          startedRef.current = battleId;
          trackEvent("battle_started", {
            battle_id: battleId,
            category: battle.category,
            items_in_pool: battle.items.length,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "missing" });
      });
    return () => {
      cancelled = true;
    };
  }, [battleId]);

  async function handleComplete(ratings: Record<string, string>) {
    setSubmitting(true);
    // `submitBattleResult` scores locally before it writes and returns the
    // comparison either way, so a failed insert still shows the player their
    // result. `battle_completed` is reported inside it, not here, so the event
    // fires exactly once per finished round.
    const comparison = await submitBattleResult(battleId, ratings);
    setSubmitting(false);
    if (comparison) setResult({ comparison, ratings });
  }

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-10">
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="mx-auto h-64 w-40" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <TriangleAlert className="h-10 w-10 text-muted" aria-hidden />
        <h1 className="text-lg font-semibold">Батл не найден</h1>
        <p className="text-sm text-muted">
          Ссылка неверна или батл был удалён автором. Попросите новую — или соберите свой.
        </p>
        <Button asChild variant="secondary">
          <Link href="/tier-list">
            <Swords className="h-4 w-4" aria-hidden />
            К своему тир-листу
          </Link>
        </Button>
      </div>
    );
  }

  const { battle } = state;

  // Checked before anything else the page could show: the author landing on
  // their own link wants the results, not a round against themselves.
  if (user && user.id === battle.creatorId) {
    return <BattleOwnerView battle={battle} />;
  }

  if (battle.items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <TriangleAlert className="h-10 w-10 text-muted" aria-hidden />
        <h1 className="text-lg font-semibold">В этом батле нет позиций</h1>
        <p className="text-sm text-muted">Автор собрал пустой набор — оценивать нечего.</p>
      </div>
    );
  }

  if (result) {
    return (
      <BattleResults
        battleId={battleId}
        comparison={result.comparison}
        items={battle.items}
        creatorRatings={battle.creatorRatings}
        participantRatings={result.ratings}
      />
    );
  }

  return (
    <BattleVoting items={battle.items} onComplete={handleComplete} submitting={submitting} />
  );
}
