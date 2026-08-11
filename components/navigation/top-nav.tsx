"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard } from "lucide-react";
import { NAV_ITEMS } from "@/components/navigation/nav-items";
import { cn } from "@/lib/utils/cn";

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 hidden border-b border-border bg-background/80 backdrop-blur md:block">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Clapperboard className="h-5 w-5 text-accent" aria-hidden />
          <span>
            Cine<span className="text-accent">Tier</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Основная навигация">
          {NAV_ITEMS.filter((item) => item.href !== "/settings").map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-surface-raised text-foreground" : "text-muted hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/settings"
          className={cn(
            "rounded-lg p-2 text-muted transition-colors hover:text-foreground",
            pathname === "/settings" && "text-foreground"
          )}
          aria-label="Настройки"
          aria-current={pathname === "/settings" ? "page" : undefined}
        >
          <NavIcon />
        </Link>
      </div>
    </header>
  );
}

function NavIcon() {
  const Icon = NAV_ITEMS.find((i) => i.href === "/settings")!.icon;
  return <Icon className="h-5 w-5" aria-hidden />;
}
