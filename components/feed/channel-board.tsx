"use client";

import { ChannelThumbnail } from "@/components/channel-card/channel-thumbnail";
import { tierColorVar } from "@/lib/utils/tier-style";
import type { ChannelTierRow } from "@/lib/feed/post-preview";
import { cn } from "@/lib/utils/cn";

interface ChannelBoardProps {
  rows: ChannelTierRow[];
  /** Same meaning as `TierBoard`'s: `compact` is the feed card, `full` the dialog. */
  variant?: "compact" | "full";
  className?: string;
}

/**
 * `TierBoard`, for a board of YouTube channels rather than catalogue titles.
 *
 * Its own component rather than a `TierBoard` variant: a channel has no
 * `tmdbId` or poster path to hand `Poster`, and looks like itself — a round
 * avatar, not a film poster — through `ChannelThumbnail`, the same component
 * every other channel view in the app already uses.
 */
export function ChannelBoard({ rows, variant = "compact", className }: ChannelBoardProps) {
  const compact = variant === "compact";

  return (
    <div className={cn("relative", compact ? "space-y-1" : "space-y-1.5", className)}>
      {rows.map((row) => (
        <div key={row.tier} className="flex items-stretch gap-1">
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded font-bold text-background",
              compact ? "w-5 text-[10px] sm:w-6" : "w-8 flex-col gap-0.5 text-sm sm:w-10"
            )}
            style={{ backgroundColor: tierColorVar(row.tier) }}
          >
            {row.tier}
            {!compact && (
              <span className="text-[9px] font-medium leading-none opacity-80">
                {row.channels.length}
              </span>
            )}
          </span>

          <div
            className={cn(
              "flex min-w-0 flex-1 gap-1",
              compact ? "overflow-hidden" : "flex-wrap content-start"
            )}
          >
            {row.channels.map((channel) => (
              <ChannelThumbnail
                key={channel.channelId}
                thumbnailUrl={channel.thumbnailUrl}
                title={channel.title}
                className={cn("shrink-0", compact ? "w-10 sm:w-12" : "w-14 sm:w-16")}
                sizes={compact ? "48px" : "64px"}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
