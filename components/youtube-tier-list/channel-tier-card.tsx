"use client";

import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { X } from "lucide-react";
import { ChannelThumbnail } from "@/components/channel-card/channel-thumbnail";
import { QuickTierMenu } from "@/components/tier-list/quick-tier-menu";
import type { TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import type { Density } from "@/lib/hooks/use-density";
import { formatCompactCount } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

interface ChannelTierCardProps {
  channel: RankedChannel;
  itemId: string;
  draggable: boolean;
  density: Density;
  onRemove: (channel: RankedChannel) => void;
  onQuickTierChange: (channel: RankedChannel, tier: TierOrUnrated) => void;
}

function ChannelTierCardImpl({
  channel,
  itemId,
  draggable,
  density,
  onRemove,
  onQuickTierChange,
}: ChannelTierCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId,
    disabled: !draggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isCompact = density === "compact";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      className={cn(
        "group relative shrink-0 select-none text-center",
        isCompact ? "w-16 sm:w-20" : "w-24 sm:w-28",
        draggable && "touch-none cursor-grab active:cursor-grabbing",
        isDragging && "z-10 opacity-40"
      )}
    >
      <div className="relative">
        <ChannelThumbnail
          thumbnailUrl={channel.thumbnailUrl}
          title={channel.title}
          className="transition-transform md:group-hover:scale-[1.03]"
        />
        <Link
          href={`/youtube/channel/${channel.channelId}`}
          className="absolute inset-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={`Open “${channel.title}”`}
          draggable={false}
        />
        <button
          type="button"
          onClick={() => onRemove(channel)}
          className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted shadow backdrop-blur transition-opacity hover:text-tier-s focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          aria-label={`Remove “${channel.title}” from the list`}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
          <QuickTierMenu
            currentTier={channel.tier}
            label={channel.title}
            onSelect={(tier) => onQuickTierChange(channel, tier)}
          />
        </div>
      </div>
      <p className="mt-2 line-clamp-1 break-words text-[11px] font-medium" title={channel.title}>
        {channel.title}
      </p>
      <p className="text-[10px] text-muted">
        {channel.subscriberCount !== undefined ? `${formatCompactCount(channel.subscriberCount)} subs` : "—"}
      </p>
    </div>
  );
}

export const ChannelTierCard = memo(ChannelTierCardImpl);
