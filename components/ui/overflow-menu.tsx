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
  /**
   * Tinted like the rest of the app's irreversible actions, so "Clear board"
   * does not read as one more line the same weight as "Download PNG" — the
   * confirmation dialog is the real guard, this is what tells a thumb to slow
   * down before it gets there.
   */
  destructive?: boolean;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  /** What the trigger announces. Say which toolbar it belongs to. */
  label?: string;
  className?: string;
}

/** Matches the panel's `w-52`. Kept in sync by hand — see the comment below. */
const PANEL_WIDTH = 208;

/** Where the panel's top-left corner belongs, in viewport coordinates. */
interface Anchor {
  top: number;
  left: number;
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
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = anchor !== null;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setAnchor(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAnchor(null);
    }
    // A toolbar this short is not somewhere anybody scrolls with the menu open,
    // but closing on scroll costs nothing and rules out a panel left pinned to
    // a button that has since moved.
    function handleScroll() {
      setAnchor(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [open]);

  function toggle() {
    if (open) {
      setAnchor(null);
      return;
    }
    /*
     * Measured from the trigger itself, then clamped to the viewport.
     *
     * The panel used to anchor with `right-0` against its own tiny wrapper —
     * fine while the trigger sat at the visible right edge of its row, wrong
     * the moment a toolbar had one button too many for one line: flex-wrap
     * starts the trigger's new line at the row's *left* edge, and a 208px
     * panel whose right edge is pinned to a 32px button near x=16 hangs off
     * the left side of the screen by design, not by any stacking bug — no
     * amount of z-index or `position: fixed` changes where that math lands.
     * Clamping the left edge into [8, viewport − width − 8] is what actually
     * keeps it on screen, wrapped or not.
     */
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const preferredLeft = rect.right - PANEL_WIDTH;
    const left = Math.min(Math.max(preferredLeft, 8), window.innerWidth - PANEL_WIDTH - 8);
    setAnchor({ top: rect.bottom + 4, left });
  }

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
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

      {anchor && (
        <div
          role="menu"
          style={{ top: anchor.top, left: anchor.left, width: PANEL_WIDTH }}
          /*
           * Fixed to the viewport, not absolute within the trigger's own box:
           * see the comment in `toggle`. z-40 matches the sticky headers and
           * the tier-list category dropdown — this shipped at z-30, which tied
           * with the tier list's own `sticky z-30` filter bar, and a tie at
           * equal z-index is broken by DOM order. The filter bar comes later
           * in the markup and painted over the panel, leaving only whatever
           * poked out past its bottom edge — which on a three-item menu was
           * just "OBS widget".
           */
          className="fixed z-40 rounded-xl border border-border bg-surface-raised p-1.5 shadow-xl"
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
              item.destructive ? "text-tier-s hover:bg-tier-s/10" : undefined,
              item.disabled && "pointer-events-none opacity-50"
            );

            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                role="menuitem"
                className={classes}
                onClick={() => setAnchor(null)}
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
                  setAnchor(null);
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
