import Link from "next/link";
import { Clapperboard, Drama, Gamepad2, ListChecks, SquarePlay } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CONTENT_TYPE_ACCENTS } from "@/lib/utils/content-type";

/** Every catalog the tier list can draw from, in the order the nav shows them. */
const SECTIONS = [
  { href: "/discover", label: "Films", icon: Clapperboard, accent: CONTENT_TYPE_ACCENTS.movie },
  { href: "/anime", label: "Anime", icon: Drama, accent: CONTENT_TYPE_ACCENTS.anime },
  { href: "/games", label: "Games", icon: Gamepad2, accent: CONTENT_TYPE_ACCENTS.game },
  { href: "/youtube", label: "YouTube", icon: SquarePlay, accent: CONTENT_TYPE_ACCENTS.youtube },
];

export function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-surface px-6 py-14 text-center animate-fade-in">
      <ListChecks className="h-12 w-12 text-accent" aria-hidden />

      <div>
        <h2 className="text-xl font-semibold">Your tier list is empty</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Add films, anime, games or YouTube channels and sort them into tiers from S down to F.
        </p>
      </div>

      {/* Two columns on a phone, four once there is room — every catalog is one
          tap away instead of the two the old movie-only buttons offered. */}
      <div className="grid w-full max-w-lg grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {SECTIONS.map(({ href, label, icon: Icon, accent }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 py-4 text-sm font-medium transition-colors",
              accent.hoverBorder,
              accent.hoverBg
            )}
          >
            <Icon className={cn("h-6 w-6 transition-colors", accent.text)} aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
