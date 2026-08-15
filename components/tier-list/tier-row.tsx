"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { BoardCard } from "@/components/tier-list/board-card";
import type { RankedTitle, TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import type { Density } from "@/lib/hooks/use-density";
import { TIER_META } from "@/lib/tier-meta";
import { tierColorVar } from "@/lib/utils/tier-style";
import { boardItemKey, type BoardItem } from "@/lib/utils/board-item";
import { titlesCountLabel } from "@/lib/utils/plural";
import { cn } from "@/lib/utils/cn";

interface TierRowProps {
  tier: TierOrUnrated;
  items: BoardItem[];
  itemIds: string[];
  draggable: boolean;
  filtersActive: boolean;
  density: Density;
  onRemoveTitle: (title: RankedTitle) => void;
  onRemoveChannel: (channel: RankedChannel) => void;
  onTitleTier: (title: RankedTitle, tier: TierOrUnrated) => void;
  onChannelTier: (channel: RankedChannel, tier: TierOrUnrated) => void;
}

function TierRowImpl({
  tier,
  items,
  itemIds,
  draggable,
  filtersActive,
  density,
  onRemoveTitle,
  onRemoveChannel,
  onTitleTier,
  onChannelTier,
}: TierRowProps) {
  const { setNodeRef, isOver } = useDroppable({ id: tier });
  const isUnrated = tier === "Unrated";
  const meta = TIER_META[tier];

  return (
    // The droppable covers the whole row, tier label included — dropping on the
    // big coloured letter is the obvious gesture, and when it wasn't a target
    // the drop silently did nothing.
    <div
      ref={setNodeRef}
      className={cn(
        "flex rounded-xl border border-border bg-surface transition-colors",
        isUnrated && "mt-2 border-dashed",
        isOver && "border-accent"
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
        <span className="line-clamp-2 break-words text-[10px] font-medium leading-tight sm:text-xs">
          {meta.name}
        </span>
        <span className="text-[10px] opacity-80">{titlesCountLabel(items.length)}</span>
      </div>
      <div
        role="list"
        aria-label={`Titles in the ${meta.name} tier`}
        className={cn(
          "flex min-h-28 flex-1 flex-wrap content-start items-start gap-3 p-3 transition-colors sm:min-h-32",
          isOver && "bg-accent/5"
        )}
      >
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          {items.length === 0 && (
            <p className="flex h-24 items-center px-2 text-xs text-muted">
              {filtersActive ? "No matches" : draggable ? "Drag titles here" : "Nothing here yet"}
            </p>
          )}
          {items.map((item) => (
            <BoardCard
              key={boardItemKey(item)}
              item={item}
              draggable={draggable}
              density={density}
              onRemoveTitle={onRemoveTitle}
              onRemoveChannel={onRemoveChannel}
              onTitleTier={onTitleTier}
              onChannelTier={onChannelTier}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export const TierRow = memo(TierRowImpl);
