"use client";

import { Poster } from "@/components/movie-card/poster";
import { TIER_META } from "@/lib/tier-meta";
import { tierColorVar } from "@/lib/utils/tier-style";
import type { MiniTierRow } from "@/lib/feed/post-preview";
import { cn } from "@/lib/utils/cn";

interface TierBoardProps {
  rows: MiniTierRow[];
  /**
   * `compact` is the feed card: fixed small posters on one line, sized so the
   * card keeps a predictable height. `full` is the dialog: bigger posters that
   * wrap, because there the board is the content rather than a thumbnail.
   */
  variant?: "compact" | "full";
  className?: string;
}

/**
 * The tier rows themselves, shared by the feed card and the post dialog.
 *
 * One component rather than two so the plate colours, the tier order and the
 * "what a tier row looks like" decision live in a single place — the card and
 * the dialog differ only in scale.
 */
export function TierBoard({ rows, variant = "compact", className }: TierBoardProps) {
  const compact = variant === "compact";

  return (
    <div className={cn(compact ? "space-y-1" : "space-y-1.5", className)}>
      {rows.map((row) => (
        <div key={row.tier} className="flex items-stretch gap-1">
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded font-bold text-background",
              compact ? "w-5 text-[10px] sm:w-6" : "w-8 flex-col gap-0.5 text-sm sm:w-10"
            )}
            style={{ backgroundColor: tierColorVar(row.tier) }}
            title={compact ? undefined : TIER_META[row.tier].name}
          >
            {row.tier}
            {!compact && (
              <span className="text-[9px] font-medium leading-none opacity-80">
                {row.titles.length}
              </span>
            )}
          </span>

          {/* Fixed poster width, not `flex-1`: the height follows from it through
              the 2/3 aspect ratio, which is what keeps the card predictable. It
              also stops a three-poster row from stretching its cards wider than
              a full row's, which would make the emptier tier look bigger. */}
          <div
            className={cn(
              "flex min-w-0 flex-1 gap-1",
              compact ? "overflow-hidden" : "flex-wrap content-start"
            )}
          >
            {row.titles.map((title) => (
              <Poster
                key={`${title.mediaType}-${title.tmdbId}`}
                posterPath={title.posterPath}
                title={title.title}
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
