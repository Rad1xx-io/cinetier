"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clapperboard, Drama, Gamepad2, SquarePlay, Tv } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CATALOG_FILTERS, type ContentType } from "@/lib/utils/content-type";
import { cn } from "@/lib/utils/cn";

/** How many ranked entries each catalog holds, for the counts beside the names. */
export type CatalogCounts = Record<ContentType, number>;

const ICONS: Record<ContentType, LucideIcon> = {
  movie: Clapperboard,
  tv: Tv,
  anime: Drama,
  game: Gamepad2,
  youtube: SquarePlay,
};

interface TierListPickerProps {
  value: ContentType;
  onChange: (value: ContentType) => void;
  counts: CatalogCounts;
}

/**
 * Which list the board is showing.
 *
 * Replaces a row of chips. Six labels do not fit one line on a phone, so
 * the row wrapped and became the widest thing on the page — and it read as six
 * filters of equal weight rather than as one question with one answer. A
 * trigger that names the current list answers that question before it is asked,
 * and costs one line at any width.
 *
 * Hand-rolled rather than pulled from a popover library, matching the quick
 * tier menu: a real button, Escape closes and returns focus, an outside click
 * closes, and the options are radios because exactly one is ever chosen.
 */
export function TierListPicker({ value, onChange, counts }: TierListPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const current = CATALOG_FILTERS.find((o) => o.value === value) ?? CATALOG_FILTERS[0];
  const CurrentIcon = ICONS[current.value];

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Showing ${current.label} — choose a list`}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <CurrentIcon className="h-3.5 w-3.5 text-muted" aria-hidden />
        {current.label}
        <span className="text-muted">{counts[current.value]}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Choose a list"
          className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-xl border border-border bg-surface-raised p-1 shadow-lg"
        >
          {CATALOG_FILTERS.map((option) => {
            const Icon = ICONS[option.value];
            const selected = option.value === value;
            const count = counts[option.value];
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors",
                  selected ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-surface"
                )}
              >
                <Icon
                  className={cn("h-3.5 w-3.5 shrink-0", selected ? "text-accent-foreground" : "text-muted")}
                  aria-hidden
                />
                <span className="flex-1 truncate">{option.label}</span>
                {/* An empty catalog still shows its zero: it is the difference
                    between "nothing ranked here yet" and "this list is missing". */}
                <span className={cn("tabular-nums", selected ? "text-accent-foreground/80" : "text-muted")}>
                  {count}
                </span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
