"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface OverflowMenuItem {
  label: string;
  icon?: LucideIcon;
  /** A button. Ignored when `href` is given. */
  onSelect?: () => void;
  /** A link, for the items that navigate rather than act. */
  href?: string;
  disabled?: boolean;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  /** What the trigger announces. Say which toolbar it belongs to. */
  label?: string;
  className?: string;
}

/**
 * The second-tier actions of a toolbar, behind one button.
 *
 * Deliberately one component used in both toolbars rather than two that happen
 * to look alike. "The other things you can do here" is a single idea, and the
 * moment it is written twice the two copies start disagreeing about width,
 * about whether Escape closes them, about which corner they open from — and a
 * reader has to learn the control twice.
 *
 * A toolbar keeps only what somebody reaches for every session. Everything
 * else — exporting, changing who can see a board, fetching an embed code — is
 * done once and then not again for a month, and each one of those sitting out
 * in the row costs the actions that matter their prominence.
 */
export function OverflowMenu({ items, label = "More actions", className }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={cn(
          // Matches Button's `secondary` at size `sm`, squared off: the toolbar
          // is a row of one height, and a trigger half a pixel out of step is
          // the first thing an eye catches.
          "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-raised text-foreground transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          open && "bg-white/5"
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          // Anchored to the right edge: this is the last control in a toolbar
          // that sits at the right of its header, and opening leftward is what
          // keeps the panel on screen at 375px.
          className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-border bg-surface-raised p-1.5 shadow-xl"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
                <span className="truncate">{item.label}</span>
              </>
            );
            const classes = cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface",
              item.disabled && "pointer-events-none opacity-50"
            );

            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                role="menuitem"
                className={classes}
                onClick={() => setOpen(false)}
              >
                {content}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={classes}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
