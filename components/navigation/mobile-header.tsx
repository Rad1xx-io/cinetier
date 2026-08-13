import Link from "next/link";
import { Clapperboard } from "lucide-react";
import { GlobalSearch } from "@/components/navigation/global-search";
import { AuthArea } from "@/components/navigation/auth-area";

/**
 * The bottom tab bar (BottomNav) handles primary category navigation on
 * mobile; this slim top bar carries the things that don't fit there —
 * branding, search, and account access — matching the desktop TopNav's
 * right-hand cluster.
 */
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur md:hidden">
      <Link href="/" className="flex items-center gap-1.5 font-semibold tracking-tight">
        <Clapperboard className="h-4.5 w-4.5 text-accent" aria-hidden />
        <span className="text-sm">
          Cine<span className="text-accent">Tier</span>
        </span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <GlobalSearch />
        <AuthArea compact />
      </div>
    </header>
  );
}
