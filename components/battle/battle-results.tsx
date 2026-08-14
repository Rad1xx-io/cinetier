"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Check, Copy, Share2, Swords, ThumbsUp, Zap } from "lucide-react";
import { Poster } from "@/components/movie-card/poster";
import { Button } from "@/components/ui/button";
import { tierColorVar } from "@/lib/utils/tier-style";
import { trackLinkCopied, trackShareClicked } from "@/lib/analytics/events";
import type { BattleComparison, BattleItem } from "@/lib/types/battle";
import { cn } from "@/lib/utils/cn";

const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface BattleResultsProps {
  battleId: string;
  comparison: BattleComparison;
  items: BattleItem[];
  creatorRatings: Record<string, string>;
  participantRatings: Record<string, string>;
}

/**
 * `navigator.share` is typed as always present but genuinely missing on desktop
 * browsers, so this is a `typeof` check rather than a truthiness one.
 */
function canWebShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** Colours the score the way a tier is coloured, so the number reads at a glance. */
function scoreColorVar(percentage: number): string {
  if (percentage >= 80) return tierColorVar("S");
  if (percentage >= 60) return tierColorVar("A");
  if (percentage >= 40) return tierColorVar("B");
  if (percentage >= 20) return tierColorVar("D");
  return tierColorVar("F");
}

function verdict(percentage: number): string {
  if (percentage >= 90) return "Один и тот же человек";
  if (percentage >= 75) return "Родственные души";
  if (percentage >= 55) return "Много общего";
  if (percentage >= 35) return "Есть о чём поспорить";
  return "Полярные вкусы";
}

export function BattleResults({
  battleId,
  comparison,
  items,
  creatorRatings,
  participantRatings,
}: BattleResultsProps) {
  const [copied, setCopied] = useState(false);
  const itemsById = new Map(items.map((item) => [item.id, item]));

  const handleShare = useCallback(async () => {
    trackShareClicked("battle", battleId);
    const url = `${window.location.origin}/battle/${battleId}`;
    const text = `Наши вкусы совпали на ${comparison.overallMatchPercentage}%. Проверьте свой результат:`;

    // Web Share where it exists — on a phone that opens the real share sheet,
    // which beats a clipboard copy the user then has to paste somewhere.
    if (canWebShare()) {
      try {
        await navigator.share({ title: "CineTier — Батл вкусов", text, url });
        return;
      } catch {
        // Dismissing the sheet rejects too, so fall through to copying rather
        // than treating a cancelled share as a failure worth reporting.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      trackLinkCopied("battle", battleId);
      setCopied(true);
    } catch {
      // Clipboard can be refused on an insecure origin; showing the address is
      // better than a button that silently does nothing.
      window.prompt("Скопируйте ссылку:", url);
    }
  }, [battleId, comparison.overallMatchPercentage]);

  const { overallMatchPercentage: score, sharedItemCount } = comparison;
  const ringOffset = RING_CIRCUMFERENCE * (1 - score / 100);
  const hasOverlap = sharedItemCount > 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <div className="flex flex-col items-center text-center">
        <p className="text-xs uppercase tracking-wide text-muted">Результат батла</p>

        {hasOverlap ? (
          <>
            <div className="relative mt-4 h-36 w-36">
              <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden>
                <circle
                  cx="64"
                  cy="64"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--surface-raised)"
                  strokeWidth="10"
                />
                <circle
                  cx="64"
                  cy="64"
                  r={RING_RADIUS}
                  fill="none"
                  stroke={scoreColorVar(score)}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  className="animate-ring-fill"
                  style={
                    {
                      "--ring-circumference": RING_CIRCUMFERENCE,
                      "--ring-offset": ringOffset,
                    } as React.CSSProperties
                  }
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-4xl font-bold tabular-nums"
                  style={{ color: scoreColorVar(score) }}
                >
                  {score}%
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted">совпадение</span>
              </div>
            </div>

            <h1 className="mt-4 text-2xl font-bold tracking-tight">{verdict(score)}</h1>
            <p className="mt-1 text-sm text-muted">
              Сравнили {sharedItemCount} из {items.length} позиций.
            </p>
          </>
        ) : (
          // 0% here would be a lie: no shared ratings is no evidence, not opposite taste.
          <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-8">
            <h1 className="text-xl font-bold tracking-tight">Сравнивать нечего</h1>
            <p className="mt-2 text-sm text-muted">
              Вы пропустили все позиции, поэтому общих оценок не набралось. Процент совпадения
              появится, если оценить хотя бы одну.
            </p>
          </div>
        )}
      </div>

      {comparison.topAgreements.length > 0 && (
        <ComparisonList
          title="Полное согласие"
          icon={<ThumbsUp className="h-4 w-4 text-tier-c" aria-hidden />}
          itemIds={comparison.topAgreements}
          itemsById={itemsById}
          creatorRatings={creatorRatings}
          participantRatings={participantRatings}
        />
      )}

      {comparison.topDisagreements.length > 0 && (
        <ComparisonList
          title="Главные споры"
          icon={<Zap className="h-4 w-4 text-tier-s" aria-hidden />}
          itemIds={comparison.topDisagreements}
          itemsById={itemsById}
          creatorRatings={creatorRatings}
          participantRatings={participantRatings}
        />
      )}

      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button asChild>
          <Link href="/tier-list">
            <Swords className="h-4 w-4" aria-hidden />
            Создать свой батл
          </Link>
        </Button>
        <Button variant="secondary" onClick={handleShare}>
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : canWebShare() ? (
            <Share2 className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copied ? "Ссылка скопирована" : "Поделиться результатом"}
        </Button>
      </div>
    </div>
  );
}

function ComparisonList({
  title,
  icon,
  itemIds,
  itemsById,
  creatorRatings,
  participantRatings,
}: {
  title: string;
  icon: React.ReactNode;
  itemIds: string[];
  itemsById: Map<string, BattleItem>;
  creatorRatings: Record<string, string>;
  participantRatings: Record<string, string>;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h2>
      <ul className="space-y-2">
        {itemIds.map((itemId) => {
          const item = itemsById.get(itemId);
          const creatorTier = creatorRatings[itemId];
          const yourTier = participantRatings[itemId];

          return (
            <li
              key={itemId}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5"
            >
              <Poster
                posterPath={null}
                fallbackSrc={item?.posterUrl ?? null}
                title={item?.title ?? itemId}
                className="w-12 shrink-0"
                sizes="48px"
              />
              <p className="min-w-0 flex-1 text-sm font-medium">
                {/* The pool is a frozen snapshot, so a missing entry means the
                    rating outlived its item — name the id rather than blank out. */}
                <span className="line-clamp-2 break-words">{item?.title ?? itemId}</span>
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <TierBadge label="Автор" tier={creatorTier} />
                <span className="text-xs text-muted" aria-hidden>
                  |
                </span>
                <TierBadge label="Вы" tier={yourTier} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TierBadge({ label, tier }: { label: string; tier: string | undefined }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] leading-none text-muted">{label}</span>
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold",
          tier ? "text-background" : "border border-border text-muted"
        )}
        style={tier ? { backgroundColor: `var(--tier-${tier.toLowerCase()})` } : undefined}
      >
        {tier ?? "—"}
      </span>
    </span>
  );
}
