"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Settings } from "lucide-react";
import { PodiumIcon } from "@/components/icons/podium-icon";
import {
  DESKTOP_NAV_CENTER,
  DESKTOP_NAV_LEFT,
  DESKTOP_NAV_RIGHT,
  TIER_LIST_NAV_ITEM,
  isNavItemActive,
  type NavEntry,
  type NavGroup,
  type NavLeaf,
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
            <PodiumIcon className="h-5 w-5 text-accent" aria-hidden />
            <span>
              TierList<span className="text-accent">Online</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Categories">
            {DESKTOP_NAV_LEFT.map((entry) => (
              <CategoryEntry key={entry.label} entry={entry} pathname={pathname} />
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {DESKTOP_NAV_CENTER.map((item) =>
            item.href === TIER_LIST_NAV_ITEM.href ? (
              <TierListTab key={item.href} pathname={pathname} />
            ) : (
              <FeedTab key={item.href} item={item} pathname={pathname} />
            )
          )}
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1">
          <nav className="flex items-center gap-1" aria-label="Categories">
            {DESKTOP_NAV_RIGHT.map((entry) => (
              <CategoryEntry key={entry.label} entry={entry} pathname={pathname} />
            ))}
          </nav>

          <div className="ml-2 flex shrink-0 items-center gap-1">
            <GlobalSearch />
            <Link
              href="/settings"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-foreground",
                pathname === "/settings" && "text-foreground"
              )}
              aria-label="Settings"
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

/** A flanking entry — a plain link for a leaf, a menu trigger for a group. */
function CategoryEntry({ entry, pathname }: { entry: NavEntry; pathname: string }) {
  if (entry.kind === "group") return <CategoryGroup group={entry} pathname={pathname} />;
  return <CategoryLink item={entry} pathname={pathname} />;
}

/** A flanking category — deliberately quieter than the centred tier-list tab. */
function CategoryLink({ item, pathname }: { item: NavLeaf; pathname: string }) {
  const active = isNavItemActive(pathname, item);
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
 * A flanking category that actually leads to more than one place. Same
 * hand-rolled interaction as `TierListPicker` (a real button, Escape closes
 * and returns focus, an outside click closes, options are radios because
 * exactly one is ever the destination) — not that component itself, which is
 * shaped around `ContentType`/counts and has nothing to do with routing.
 */
function CategoryGroup({ group, pathname }: { group: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = isNavItemActive(pathname, group);
  const Icon = group.icon;

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

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-surface-raised text-foreground" : "text-muted hover:text-foreground"
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {group.label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Choose a ${group.label.toLowerCase()} list`}
          className="absolute left-0 z-40 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-surface-raised p-1 shadow-lg"
        >
          {group.items.map((item) => {
            const selected = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
                  selected ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-surface"
                )}
              >
                <ItemIcon
                  className={cn("h-3.5 w-3.5 shrink-0", selected ? "text-accent-foreground" : "text-muted")}
                  aria-hidden
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The centre tab. Reads as primary via the accent treatment the rest of the
 * header deliberately avoids — outlined while idle so it stays a tab rather
 * than a call-to-action button, solid once you are on it.
 */
function TierListTab({ pathname }: { pathname: string }) {
  const active = isNavItemActive(pathname, TIER_LIST_NAV_ITEM);
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

/**
 * Feed's own tab, beside Tier List rather than among the discovery
 * categories — see .ai/PLAN-nav-and-mobile-games.md (A.3): watching what
 * everyone else ranked is the other half of "what happens with rankings",
 * not a catalog you browse to find something new. A step quieter than Tier
 * List on purpose — this app is not equally about both — but still tinted,
 * not the plain grey a discovery category gets.
 */
function FeedTab({ item, pathname }: { item: NavLeaf; pathname: string }) {
  const active = isNavItemActive(pathname, item);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent/15 text-accent" : "text-accent/70 hover:bg-accent/10 hover:text-accent"
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {item.label}
    </Link>
  );
}
