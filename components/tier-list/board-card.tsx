"use client";

import { memo } from "react";
import { TierCard } from "@/components/tier-list/tier-card";
import { ChannelTierCard } from "@/components/youtube-tier-list/channel-tier-card";
import type { TierOrUnrated, RankedTitle } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import type { Density } from "@/lib/hooks/use-density";
import { boardItemKey, type BoardItem } from "@/lib/utils/board-item";

interface BoardCardProps {
  item: BoardItem;
  draggable: boolean;
  density: Density;
  onRemoveTitle: (title: RankedTitle) => void;
  onRemoveChannel: (channel: RankedChannel) => void;
  onTitleTier: (title: RankedTitle, tier: TierOrUnrated) => void;
  onChannelTier: (channel: RankedChannel, tier: TierOrUnrated) => void;
}

/**
 * Picks the card that belongs to the item's store. Both take the same shape of
 * props, so the board never has to know which one it is looking at beyond
 * routing the remove/re-tier callbacks to the right place.
 */
function BoardCardImpl({
  item,
  draggable,
  density,
  onRemoveTitle,
  onRemoveChannel,
  onTitleTier,
  onChannelTier,
}: BoardCardProps) {
  const itemId = boardItemKey(item);

  if (item.kind === "title") {
    return (
      <TierCard
        title={item.title}
        itemId={itemId}
        draggable={draggable}
        density={density}
        onRemove={onRemoveTitle}
        onQuickTierChange={onTitleTier}
      />
    );
  }

  return (
    <ChannelTierCard
      channel={item.channel}
      itemId={itemId}
      draggable={draggable}
      density={density}
      onRemove={onRemoveChannel}
      onQuickTierChange={onChannelTier}
    />
  );
}

export const BoardCard = memo(BoardCardImpl);
