"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, ImageOff, Trash2 } from "lucide-react";
import type { CustomItem } from "@/lib/types/custom-list";
import { ReportButton } from "@/components/custom-list/report-button";
import { cn } from "@/lib/utils/cn";

interface CustomCardProps {
  item: CustomItem;
  canEdit: boolean;
  onHide?: (item: CustomItem, hidden: boolean) => void;
  onDelete?: (item: CustomItem) => void;
}

/**
 * One uploaded picture on the board.
 *
 * The picture is a plain `<img>`, not `next/image`: these are signed urls that
 * expire, so the optimizer would cache a copy under a key that outlives the
 * signature, and re-serve a picture after its list was hidden. Going direct
 * also keeps user uploads off a metered image pipeline sized for posters.
 */
export function CustomCard({ item, canEdit, onHide, onDelete }: CustomCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });

  const hidden = item.hiddenAt !== null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative w-[112px] shrink-0 touch-none",
        isDragging && "z-10 opacity-70"
      )}
      {...attributes}
      {...listeners}
    >
      <div
        className={cn(
          "relative aspect-2/3 overflow-hidden rounded-lg border border-border bg-surface-raised",
          hidden && "opacity-40"
        )}
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, expiring url; see note above
          <img
            src={item.imageUrl}
            alt={item.caption || "Custom card"}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted">
            <ImageOff className="h-5 w-5" aria-hidden />
            <span className="px-1 text-center text-[10px] leading-tight">Picture unavailable</span>
          </div>
        )}

        {canEdit && (
          <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onHide?.(item, !hidden)}
              className="rounded-md bg-background/80 p-1 text-muted backdrop-blur hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={hidden ? "Show this card" : "Hide this card"}
              title={hidden ? "Show this card" : "Hide this card"}
            >
              {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onDelete?.(item)}
              className="rounded-md bg-background/80 p-1 text-muted backdrop-blur hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Delete this card"
              title="Delete this card"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {!canEdit && (
          <div className="absolute right-1 top-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <ReportButton subjectType="custom_item" subjectId={item.id} label="Report this picture" />
          </div>
        )}
      </div>

      {item.caption && (
        <p className="mt-1 line-clamp-2 text-center text-[10px] leading-tight text-muted">
          {item.caption}
        </p>
      )}
    </div>
  );
}
