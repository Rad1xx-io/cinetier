"use client";

import { useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { ImagePlus, Trash2 } from "lucide-react";
import type { CustomItem, CustomTierRow as TierRowModel } from "@/lib/types/custom-list";
import { CustomCard } from "@/components/custom-list/custom-card";
import { cn } from "@/lib/utils/cn";

interface CustomTierRowProps {
  row: TierRowModel;
  items: CustomItem[];
  canEdit: boolean;
  listId: string;
  onRename: (rowId: string, label: string) => void;
  onRecolor: (rowId: string, color: string) => void;
  onDeleteRow: (rowId: string) => void;
  onUploaded: () => void;
  onHideItem: (item: CustomItem, hidden: boolean) => void;
  onDeleteItem: (item: CustomItem) => void;
}

/**
 * One tier, with its own name and its own face.
 *
 * The label column is what makes this board different from the catalogue one:
 * it is not a letter from a fixed set but whatever the owner typed, optionally
 * over a picture they uploaded. "Best game of 2026" is a tier here.
 */
export function CustomTierRow({
  row,
  items,
  canEdit,
  listId,
  onRename,
  onRecolor,
  onDeleteRow,
  onUploaded,
  onHideItem,
  onDeleteItem,
}: CustomTierRowProps) {
  const { setNodeRef, isOver } = useDroppable({ id: row.id });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadLabelImage(file: File) {
    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    form.set("listId", listId);
    form.set("tierRowId", row.id);
    // The same question the card upload asks; a tier picture is an upload too.
    form.set("rightsConfirmed", "true");
    try {
      const res = await fetch("/api/custom-uploads", { method: "POST", body: form });
      if (res.ok) onUploaded();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex overflow-hidden rounded-xl border border-border">
      <div
        className="relative flex w-24 shrink-0 flex-col items-center justify-center gap-1 p-2 text-center sm:w-28"
        style={{ backgroundColor: row.imageUrl ? undefined : row.color }}
      >
        {row.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- signed, expiring url
          <img
            src={row.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            aria-hidden
          />
        )}
        {/* Over a photograph a plain label is unreadable half the time; the
            scrim costs nothing when there is no photograph to sit on. */}
        {row.imageUrl && <div className="absolute inset-0 bg-black/45" aria-hidden />}

        {canEdit ? (
          <input
            value={row.label}
            onChange={(e) => onRename(row.id, e.target.value)}
            maxLength={40}
            aria-label="Tier name"
            className="relative z-10 w-full bg-transparent text-center text-sm font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          />
        ) : (
          <span className="relative z-10 break-words text-sm font-bold text-white">{row.label}</span>
        )}

        {canEdit && (
          <div className="relative z-10 flex items-center gap-1">
            <label
              className="cursor-pointer rounded p-0.5 text-white/80 hover:text-white"
              title="Use a picture for this tier"
            >
              <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Use a picture for this tier</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadLabelImage(file);
                }}
              />
            </label>
            <input
              type="color"
              value={row.color}
              onChange={(e) => onRecolor(row.id, e.target.value)}
              aria-label="Tier colour"
              className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
            />
            <button
              type="button"
              onClick={() => onDeleteRow(row.id)}
              className="rounded p-0.5 text-white/80 hover:text-red-300"
              aria-label={`Delete the ${row.label} tier`}
              title="Delete this tier — its cards go back to the pool"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[124px] flex-1 flex-wrap content-start gap-2 bg-surface p-2 transition-colors",
          isOver && "bg-surface-raised"
        )}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          {items.map((item) => (
            <CustomCard
              key={item.id}
              item={item}
              canEdit={canEdit}
              onHide={onHideItem}
              onDelete={onDeleteItem}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
