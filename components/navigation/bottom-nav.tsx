"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive } from "@/components/navigation/nav-items";
import { cn } from "@/lib/utils/cn";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Основная навигация"
    >
      <div className="grid grid-cols-7">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                // Six tabs leave ~62px each at 375px, so the label is clamped to
                // one line rather than wrapping and pushing the bar taller.
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
