"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { ChannelTierCard } from "@/components/youtube-tier-list/channel-tier-card";
import type { TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import type { Density } from "@/lib/hooks/use-density";
import { TIER_META } from "@/lib/tier-meta";
import { tierColorVar } from "@/lib/utils/tier-style";
import { titlesCountLabel } from "@/lib/utils/plural";
import { cn } from "@/lib/utils/cn";

interface ChannelTierRowProps {
  tier: TierOrUnrated;
  items: RankedChannel[];
  itemIds: string[];
  draggable: boolean;
  filtersActive: boolean;
  density: Density;
  onRemove: (channel: RankedChannel) => void;
  onQuickTierChange: (channel: RankedChannel, tier: TierOrUnrated) => void;
}

function ChannelTierRowImpl({
  tier,
  items,
  itemIds,
  draggable,
  filtersActive,
  density,
  onRemove,
  onQuickTierChange,
}: ChannelTierRowProps) {
  const { setNodeRef, isOver } = useDroppable({ id: tier });
  const isUnrated = tier === "Unrated";
  const meta = TIER_META[tier];

  return (
    // Droppable covers the whole row, tier label included — see the movies/TV row.
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
        aria-label={`Channels in the ${meta.name} tier`}
        className={cn(
          "flex min-h-28 flex-1 flex-wrap content-start items-start gap-4 p-3 transition-colors sm:min-h-32",
          isOver && "bg-accent/5"
        )}
      >
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          {items.length === 0 && (
            <p className="flex h-24 items-center px-2 text-xs text-muted">
              {filtersActive ? "No matches" : draggable ? "Drag channels here" : "Nothing here yet"}
            </p>
          )}
          {items.map((channel) => (
            <ChannelTierCard
              key={channel.channelId}
              channel={channel}
              itemId={channel.channelId}
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

export const ChannelTierRow = memo(ChannelTierRowImpl);
