"use client";

import { useEffect, useRef, useState } from "react";
import { TIER_ORDER, type TierOrUnrated } from "@/lib/types";
import { tierColorVar } from "@/lib/utils/tier-style";
import { TIER_META } from "@/lib/tier-meta";
import { cn } from "@/lib/utils/cn";

interface QuickTierMenuProps {
  currentTier: TierOrUnrated;
  onSelect: (tier: TierOrUnrated) => void;
  label: string;
}

/**
 * Small hand-rolled popover (no Radix Popover dependency) letting a title's tier
 * be changed without drag-and-drop — the primary way to do this on mobile.
 * Fully keyboard operable: a real <button> trigger, Escape closes and returns
 * focus, outside click closes.
 */
export function QuickTierMenu({ currentTier, onSelect, label }: QuickTierMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const isUnrated = currentTier === "Unrated";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Изменить тир для «${label}» (сейчас: ${TIER_META[currentTier].name})`}
        className="flex h-7 min-w-7 touch-none items-center justify-center rounded-md px-1.5 text-[11px] font-bold shadow backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style={{
          backgroundColor: isUnrated ? "var(--surface-raised)" : tierColorVar(currentTier),
          color: isUnrated ? "var(--muted)" : "var(--background)",
        }}
      >
        {isUnrated ? "—" : currentTier}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Выбор тира"
          className="absolute left-1/2 top-full z-30 mt-1 flex -translate-x-1/2 gap-0.5 rounded-lg border border-border bg-surface-raised p-1 shadow-xl"
        >
          {TIER_ORDER.map((tier) => {
            const active = tier === currentTier;
            const unrated = tier === "Unrated";
            return (
              <button
                key={tier}
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelect(tier);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                title={TIER_META[tier].name}
                aria-current={active}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded text-[11px] font-bold transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active && "ring-2 ring-accent"
                )}
                style={{
                  backgroundColor: unrated ? "var(--surface)" : tierColorVar(tier),
                  color: unrated ? "var(--muted)" : "var(--background)",
                }}
              >
                {unrated ? "—" : tier}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
