"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { ALL_COUNTRIES, findCountryLabel, flagEmoji } from "@/lib/youtube/region-groups";
import { cn } from "@/lib/utils/cn";

interface CountrySelectProps {
  value: string;
  onChange: (code: string) => void;
}

/**
 * Hand-rolled searchable combobox (same pattern as QuickTierMenu — no Radix
 * dependency in this codebase). A plain <select> with ~40 flat <option>s was
 * uncomfortable to scan; this lets typing narrow the list instead.
 */
export function CountrySelect({ value, onChange }: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function close() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_COUNTRIES;
    return ALL_COUNTRIES.filter(
      (c) => c.label.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [query]);

  function select(code: string) {
    onChange(code);
    close();
    triggerRef.current?.focus();
  }

  const triggerLabel = value ? `${flagEmoji(value)} ${findCountryLabel(value)}` : "All countries";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {triggerLabel}
        <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose a country"
          className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl"
        >
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute left-4.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search countries…"
              className="h-8 w-full rounded-md border border-border bg-surface pl-7 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              onClick={() => select("")}
              className={cn(
                "flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-surface",
                value === "" && "font-semibold text-accent"
              )}
            >
              All countries
            </button>
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                role="option"
                aria-selected={value === c.code}
                onClick={() => select(c.code)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface",
                  value === c.code && "font-semibold text-accent"
                )}
              >
                <span aria-hidden>{flagEmoji(c.code)}</span>
                {c.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted">No country found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
