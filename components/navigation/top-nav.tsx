"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Clapperboard, Settings } from "lucide-react";
import {
  DESKTOP_NAV_LEFT,
  DESKTOP_NAV_RIGHT,
  NAV_OVERFLOW_ITEMS,
  TIER_LIST_NAV_ITEM,
  isNavItemActive,
  type NavItem,
} from "@/components/navigation/nav-items";
import { GlobalSearch } from "@/components/navigation/global-search";
import { AuthArea } from "@/components/navigation/auth-area";
import { cn } from "@/lib/utils/cn";

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 hidden border-b border-border bg-background/80 backdrop-blur md:block">
      {/*
        Three columns rather than one flex row: the outer two both take 1fr, so
        the `auto` middle column lands dead centre of the header no matter how
        wide the logo or the account cluster grow. A flex row with `ml-auto`
        could only ever centre the nav *between* them, which drifts as soon as a
        signed-in email or a longer category label changes one side's width.
      */}
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-6">
        <div className="flex min-w-0 items-center gap-1">
          <Link
            href="/"
            className="mr-2 flex shrink-0 items-center gap-2 font-semibold tracking-tight"
          >
            <Clapperboard className="h-5 w-5 text-accent" aria-hidden />
            <span>
              TierList<span className="text-accent">Online</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Категории">
            {DESKTOP_NAV_LEFT.map((item) => (
              <CategoryLink key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>
        </div>

        <TierListTab pathname={pathname} />

        <div className="flex min-w-0 items-center justify-end gap-1">
          <nav className="flex items-center gap-1" aria-label="Категории">
            {DESKTOP_NAV_RIGHT.map((item) => (
              <CategoryLink key={item.href} item={item} pathname={pathname} />
            ))}
            {NAV_OVERFLOW_ITEMS.length > 0 && <MoreMenu pathname={pathname} />}
          </nav>

          <div className="ml-2 flex shrink-0 items-center gap-1">
            <GlobalSearch />
            <Link
              href="/settings"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-foreground",
                pathname === "/settings" && "text-foreground"
              )}
              aria-label="Настройки"
              aria-current={pathname === "/settings" ? "page" : undefined}
            >
              <Settings className="h-4.5 w-4.5" aria-hidden />
            </Link>
            <div className="ml-1">
              <AuthArea />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

/** A flanking category — deliberately quieter than the centred tier-list tab. */
function CategoryLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavItemActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={cn(
        "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-surface-raised text-foreground" : "text-muted hover:text-foreground"
      )}
      aria-current={active ? "page" : undefined}
    >
      {item.label}
    </Link>
  );
}

/**
 * The centre tab. Reads as primary via the accent treatment the rest of the
 * header deliberately avoids — outlined while idle so it stays a tab rather
 * than a call-to-action button, solid once you are on it.
 */
function TierListTab({ pathname }: { pathname: string }) {
  const active = isNavItemActive(pathname, TIER_LIST_NAV_ITEM.href);
  const Icon = TIER_LIST_NAV_ITEM.icon;

  return (
    <Link
      href={TIER_LIST_NAV_ITEM.href}
      className={cn(
        "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        active
          ? "border-transparent bg-accent text-accent-foreground"
          : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {TIER_LIST_NAV_ITEM.label}
    </Link>
  );
}

/** Scaffolding for future categories (Games, Books, ...) — hidden entirely while NAV_OVERFLOW_ITEMS is empty. */
function MoreMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const anyActive = NAV_OVERFLOW_ITEMS.some((item) => isNavItemActive(pathname, item.href));

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          anyActive ? "bg-surface-raised text-foreground" : "text-muted hover:text-foreground"
        )}
      >
        Ещё
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-48 rounded-xl border border-border bg-surface-raised p-1.5 shadow-xl">
          {NAV_OVERFLOW_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-surface",
                  active && "text-accent"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
