"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { TierCard } from "@/components/tier-list/tier-card";
import type { RankedTitle, TierOrUnrated } from "@/lib/types";
import type { Density } from "@/lib/hooks/use-density";
import { TIER_META } from "@/lib/tier-meta";
import { tierColorVar } from "@/lib/utils/tier-style";
import { titlesCountLabel } from "@/lib/utils/pluralize-ru";
import { cn } from "@/lib/utils/cn";

interface TierRowProps {
  tier: TierOrUnrated;
  items: RankedTitle[];
  itemIds: string[];
  draggable: boolean;
  filtersActive: boolean;
  density: Density;
  onRemove: (title: RankedTitle) => void;
  onQuickTierChange: (title: RankedTitle, tier: TierOrUnrated) => void;
}

function TierRowImpl({
  tier,
  items,
  itemIds,
  draggable,
  filtersActive,
  density,
  onRemove,
  onQuickTierChange,
}: TierRowProps) {
  const { setNodeRef, isOver } = useDroppable({ id: tier });
  const isUnrated = tier === "Unrated";
  const meta = TIER_META[tier];

  return (
    <div
      className={cn(
        "flex rounded-xl border border-border bg-surface",
        isUnrated && "mt-2 border-dashed"
      )}
    >
      <div
        className="flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-l-xl px-1.5 py-3 text-center sm:w-24 md:w-28"
        style={{
          backgroundColor: isUnrated ? "var(--surface-raised)" : tierColorVar(tier),
          color: isUnrated ? "var(--muted)" : "var(--background)",
        }}
        title={meta.description}
      >
        <span className="text-lg font-bold sm:text-2xl" aria-hidden>
          {isUnrated ? "—" : tier}
        </span>
        <span className="line-clamp-2 text-[10px] font-medium leading-tight sm:text-xs">
          {meta.name}
        </span>
        <span className="text-[10px] opacity-80">{titlesCountLabel(items.length)}</span>
      </div>
      <div
        ref={setNodeRef}
        role="list"
        aria-label={`Тайтлы в тире «${meta.name}»`}
        className={cn(
          "flex min-h-28 flex-1 flex-wrap content-start items-start gap-3 p-3 transition-colors sm:min-h-32",
          isOver && "bg-accent/5"
        )}
      >
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          {items.length === 0 && (
            <p className="flex h-24 items-center px-2 text-xs text-muted">
              {draggable ? "Перетащите тайтлы сюда" : filtersActive ? "Нет совпадений" : "Здесь пока пусто"}
            </p>
          )}
          {items.map((title) => (
            <TierCard
              key={`${title.mediaType}-${title.tmdbId}`}
              title={title}
              itemId={`${title.mediaType}-${title.tmdbId}`}
              draggable={draggable}
              density={density}
              onRemove={onRemove}
              onQuickTierChange={onQuickTierChange}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export const TierRow = memo(TierRowImpl);
