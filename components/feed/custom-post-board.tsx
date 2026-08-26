"use client";

import { ImageOff } from "lucide-react";
import type { PublishedBoard } from "@/lib/supabase/custom-lists";
import { cn } from "@/lib/utils/cn";
import { SITE_HOST } from "@/lib/seo/site";

interface CustomPostBoardProps {
  board: PublishedBoard;
  variant?: "compact" | "full";
  className?: string;
}

/**
 * A published board of somebody's own photographs.
 *
 * The arrangement comes from the snapshot taken when it was published, so the
 * post keeps saying what it said that day however much the board has moved on.
 * The pictures do not: each one was looked up a moment ago, and a card that has
 * since been hidden, blocked or deleted arrives with nothing to show. It keeps
 * its place in the row rather than closing the gap — the shape is the part that
 * was published, and quietly reflowing it would be a different board.
 */
export function CustomPostBoard({ board, variant = "compact", className }: CustomPostBoardProps) {
  const compact = variant === "compact";
  const size = compact ? "h-12 w-8" : "h-24 w-16";

  return (
    <div className={cn("relative space-y-1", className)}>
      {board.rows.map((row) => {
        const cards = board.items
          .filter((item) => item.rowId === row.id)
          .sort((a, b) => a.position - b.position);

        return (
          <div key={row.id} className="flex overflow-hidden rounded-md">
            <div
              className="flex w-10 shrink-0 items-center justify-center px-1 text-center text-[10px] font-bold text-white"
              style={{ backgroundColor: row.color }}
            >
              <span className="line-clamp-2 break-words">{row.label}</span>
            </div>
            <div className="flex flex-1 flex-wrap gap-1 bg-surface-raised p-1">
              {cards.length === 0 ? (
                <span className="px-1 py-2 text-[10px] text-muted">Empty</span>
              ) : (
                cards.map((card) =>
                  card.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed, expiring url
                    <img
                      key={card.id}
                      src={card.imageUrl}
                      alt={card.caption || "Card"}
                      className={cn(size, "rounded object-cover")}
                    />
                  ) : (
                    <span
                      key={card.id}
                      className={cn(
                        size,
                        "flex items-center justify-center rounded border border-border bg-background text-muted"
                      )}
                      title="This picture is no longer available"
                    >
                      <ImageOff className="h-3 w-3" aria-hidden />
                    </span>
                  )
                )
              )}
            </div>
          </div>
        );
      })}

      {!compact && (
        <div
          data-export-watermark
          className="pointer-events-none absolute bottom-0 right-0 flex flex-col items-end leading-tight opacity-0"
        >
          <span className="text-xs font-semibold tracking-tight">
            TierList<span className="text-accent">Online</span>
          </span>
          <span className="text-[10px] font-medium tracking-tight text-muted">{SITE_HOST}</span>
        </div>
      )}
    </div>
  );
}
