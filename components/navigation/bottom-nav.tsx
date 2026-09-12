"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive, type NavEntry } from "@/components/navigation/nav-items";
import { cn } from "@/lib/utils/cn";

/** A group has no href of its own on this surface — it links straight to its hub page instead of opening a menu. See NavGroup's own comment for why. */
function entryHref(entry: NavEntry): string {
  return entry.kind === "group" ? entry.hubHref : entry.href;
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Main navigation"
    >
      {/*
        Column count follows NAV_ITEMS.length rather than a literal
        `grid-cols-N` class — Tailwind can only emit classes it finds as
        whole strings in the source, so a template literal here would be
        purged. A group still costs exactly one column, same as a leaf.
      */}
      <div className="grid" style={{ gridTemplateColumns: `repeat(${NAV_ITEMS.length}, minmax(0, 1fr))` }}>
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={entryHref(item)}
              className={cn(
                // Seven tabs leave ~53px each at 375px, so the label is clamped
                // to one line rather than wrapping and pushing the bar taller.
                "flex min-w-0 flex-col items-center gap-1 px-0.5 py-2.5 text-[10px] font-medium transition-colors",
                active ? "text-accent" : "text-muted"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="w-full truncate text-center">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
