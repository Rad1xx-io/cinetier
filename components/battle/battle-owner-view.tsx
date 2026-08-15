"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Share2, Swords, Trophy, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getBattleParticipants, type Battle, type BattleEntry } from "@/lib/supabase/battles";
import { trackLinkCopied, trackShareClicked } from "@/lib/analytics/events";
import { tierColorVar } from "@/lib/utils/tier-style";
import { shareUrl } from "@/lib/seo/site";

function canWebShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** Same scale the result screen uses, so one battle reads consistently. */
function scoreColorVar(percentage: number): string {
  if (percentage >= 80) return tierColorVar("S");
  if (percentage >= 60) return tierColorVar("A");
  if (percentage >= 40) return tierColorVar("B");
  if (percentage >= 20) return tierColorVar("D");
  return tierColorVar("F");
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

/**
 * What the author sees at their own battle's URL.
 *
 * Playing your own battle would score you against yourself at 100% and add a
 * meaningless row to your results, so the voting screen is replaced outright
 * rather than merely discouraged.
 */
export function BattleOwnerView({ battle }: { battle: Battle }) {
  const [entries, setEntries] = useState<BattleEntry[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBattleParticipants(battle.id).then((rows) => {
      if (!cancelled) setEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [battle.id]);

  const link = shareUrl(`/battle/${battle.id}`);

  const handleShare = useCallback(async () => {
    trackShareClicked("battle", battle.id);

    if (canWebShare()) {
      try {
        await navigator.share({
          title: "TierListOnline — Taste Battle",
          text: "Rate the same line-up I did and see how close we land:",
          url: link,
        });
        return;
      } catch {
        // A dismissed sheet rejects too — fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(link);
      trackLinkCopied("battle", battle.id);
      setCopied(true);
    } catch {
      window.prompt("Copy the link:", link);
    }
  }, [battle.id, link]);

  const best = entries?.[0];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <div className="flex flex-col items-center text-center">
        <Swords className="h-8 w-8 text-accent" aria-hidden />
        <h1 className="mt-3 text-2xl font-bold tracking-tight">This is your battle!</h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          There is nothing to compare against yourself — send the link to friends and see who lands
          closest to your taste.
        </p>

        <p className="mt-5 w-full truncate rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm">
          {link}
        </p>

        <div className="mt-3 flex w-full flex-col gap-2 sm:flex-row">
          <Button onClick={handleShare} className="flex-1">
            {copied ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : canWebShare() ? (
              <Share2 className="h-4 w-4" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
            {copied ? "Link copied" : "Share the link"}
          </Button>
          <Button asChild variant="secondary" className="sm:w-auto">
            <Link href="/tier-list">Back to my list</Link>
          </Button>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-muted" aria-hidden />
          Played this battle
          {entries && entries.length > 0 && (
            <span className="text-muted">· {entries.length}</span>
          )}
        </h2>

        {entries === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            Nobody has played it yet. As soon as a friend finishes, their result shows up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry, index) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-xs font-bold text-muted">
                  {index === 0 ? (
                    <Trophy className="h-4 w-4 text-accent" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>

                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <UserRound className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0">
                    {/* Guests are the norm here — a battle link is meant to be
                        playable without an account, so most rows have no name to
                        show and saying so beats inventing one. */}
                    <span className="block truncate text-sm font-medium">
                      {entry.userId ? "TierListOnline user" : "Guest"}
                    </span>
                    <span className="block text-xs text-muted">
                      {entry.itemsRated} rated · {formatDate(entry.createdAt)}
                    </span>
                  </span>
                </span>

                <span
                  className="shrink-0 text-lg font-bold tabular-nums"
                  style={{ color: scoreColorVar(entry.matchScore) }}
                >
                  {entry.matchScore}%
                </span>
              </li>
            ))}
          </ul>
        )}

        {best && (
          <p className="mt-3 text-center text-xs text-muted">
            Best match — {best.matchScore}%.
          </p>
        )}
      </section>
    </div>
  );
}
