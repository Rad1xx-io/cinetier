"use client";

import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { GripVertical, X } from "lucide-react";
import { Poster } from "@/components/movie-card/poster";
import { ContentTypeBadge } from "@/components/ui/content-type-badge";
import { QuickTierMenu } from "@/components/tier-list/quick-tier-menu";
import type { RankedTitle, TierOrUnrated } from "@/lib/types";
import type { Density } from "@/lib/hooks/use-density";
import { releaseYear } from "@/lib/utils/format";
import { titleHref } from "@/lib/utils/title-route";
import { cn } from "@/lib/utils/cn";

interface TierCardProps {
  title: RankedTitle;
  itemId: string;
  draggable: boolean;
  density: Density;
  onRemove: (title: RankedTitle) => void;
  onQuickTierChange: (title: RankedTitle, tier: TierOrUnrated) => void;
}

function TierCardImpl({
  title,
  itemId,
  draggable,
  density,
  onRemove,
  onQuickTierChange,
}: TierCardProps) {
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
      // The whole card is the drag surface (not just a small icon) — dnd-kit's
      // PointerSensor distance activation constraint means a plain click still
      // reaches the nested Link/buttons below; only a move past the threshold
      // starts a drag. touch-none stops the browser's own touch-scroll gesture
      // from stealing the pointer before the drag can activate.
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      className={cn(
        "group relative shrink-0 select-none",
        isCompact ? "w-16 sm:w-20" : "w-24 sm:w-28",
        draggable && "touch-none cursor-grab active:cursor-grabbing",
        isDragging && "z-10 opacity-40"
      )}
    >
      <div className="relative">
        <Poster
          posterPath={title.posterPath}
          title={title.title}
          sizes={isCompact ? "80px" : "120px"}
          className="transition-transform md:group-hover:scale-[1.03]"
        />
        <Link
          href={titleHref(title.mediaType, title.tmdbId)}
          className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={`Открыть «${title.title}»`}
          draggable={false}
        />
        {draggable && (
          <span
            data-export-hide
            className="pointer-events-none absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-background/70 text-foreground/80 backdrop-blur"
            aria-hidden
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
        <button
          data-export-hide
          type="button"
          onClick={() => onRemove(title)}
          className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md bg-background/80 text-muted backdrop-blur transition-opacity hover:text-tier-s focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          aria-label={`Удалить «${title.title}» из списка`}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div data-export-hide className="absolute bottom-1 left-1/2 -translate-x-1/2">
          <QuickTierMenu
            currentTier={title.tier}
            label={title.title}
            onSelect={(tier) => onQuickTierChange(title, tier)}
          />
        </div>
      </div>
      <p className="mt-1.5 line-clamp-1 break-words text-[11px] font-medium" title={title.title}>
        {title.title}
      </p>
      <div className="mt-0.5 flex items-center gap-1">
        <ContentTypeBadge type={title.mediaType} />
        <span className="text-[10px] text-muted">{releaseYear(title.releaseDate)}</span>
      </div>
    </div>
  );
}

export const TierCard = memo(TierCardImpl);
