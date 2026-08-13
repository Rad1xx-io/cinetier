import Link from "next/link";
import { Compass, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIERS } from "@/lib/types";
import { tierColorVar } from "@/lib/utils/tier-style";

/** Card counts per demo row — uneven on purpose, so the preview looks like a real list. */
const PREVIEW_ROWS = [4, 5, 3, 4, 2, 3];

export function Hero() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-surface px-6 py-10 md:px-10 md:py-14">
      {/* Two soft colour pools behind the content; they read as depth rather than
          decoration because the preview grid sits between them and the surface. */}
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-16 h-72 w-72 rounded-full bg-purple-500/15 blur-3xl"
        aria-hidden
      />

      <div className="relative grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Твой личный медиа-рейтинг
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">
            Составляй тир-листы фильмов, аниме, игр и любимых YouTube-каналов. Делись своим мнением
            с друзьями.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/tier-list">
                <ListChecks className="h-4 w-4" aria-hidden />
                Собрать тир-лист
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/discover">
                <Compass className="h-4 w-4" aria-hidden />
                Обзор каталога
              </Link>
            </Button>
          </div>
        </div>

        <TierPreview />
      </div>
    </section>
  );
}

/**
 * A miniature of the board. Deliberately abstract — coloured placeholders rather
 * than real posters, so it never implies content the visitor has not added and
 * costs nothing to render.
 */
function TierPreview() {
  return (
    <div
      className="relative hidden select-none flex-col gap-1.5 rounded-xl border border-border/60 bg-background/60 p-3 backdrop-blur md:flex"
      aria-hidden
    >
      {TIERS.map((tier, rowIndex) => (
        <div key={tier} className="flex items-center gap-1.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold"
            style={{ backgroundColor: tierColorVar(tier), color: "var(--background)" }}
          >
            {tier}
          </span>
          <div className="flex gap-1.5">
            {Array.from({ length: PREVIEW_ROWS[rowIndex] }).map((_, i) => (
              <span
                key={i}
                className="h-8 w-6 rounded bg-surface-raised"
                style={{ opacity: 1 - rowIndex * 0.1 }}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Fades the lower rows out instead of ending the preview on a hard edge. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-xl bg-gradient-to-t from-surface to-transparent"
        aria-hidden
      />
    </div>
  );
}
