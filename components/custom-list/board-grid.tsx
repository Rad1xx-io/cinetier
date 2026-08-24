import Link from "next/link";
import { Globe, ImageIcon, Lock } from "lucide-react";
import type { CustomBoardSummary } from "@/lib/supabase/custom-lists";
import { cn } from "@/lib/utils/cn";

interface BoardGridProps {
  boards: CustomBoardSummary[];
}

/**
 * Somebody's boards, shown as boards rather than as filenames.
 *
 * These hold photographs, and a row of titles is the one presentation that
 * throws away the only thing telling them apart. Each card leads with the first
 * picture somebody would see on opening it — reading order, top tier down,
 * skipping tiers that are empty. A board with nothing on it yet gets a plate in
 * the tier colours instead, which reads as "this is a tier list waiting to
 * happen" rather than as a broken image.
 */
export function BoardGrid({ boards }: BoardGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((board) => (
        <li key={board.id}>
          <Link
            href={`/custom/${board.id}`}
            className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg hover:shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {/* 4:3 rather than 16:9: these are photographs from a phone, and most
                of them are portrait — a letterbox crops them to a stripe. */}
            <div className="relative aspect-4/3 overflow-hidden bg-surface-raised">
              {board.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed, expiring url
                <img
                  src={board.coverUrl}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  aria-hidden
                />
              ) : (
                <EmptyPlate />
              )}

              <span
                className={cn(
                  "absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur",
                  board.isPublic
                    ? "bg-background/80 text-muted"
                    : "bg-background/80 text-amber-300/90"
                )}
              >
                {board.isPublic ? (
                  <>
                    <Globe className="h-3 w-3" aria-hidden />
                    Anyone with the link
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3" aria-hidden />
                    Only me
                  </>
                )}
              </span>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-3">
              <span className="truncate text-sm font-semibold group-hover:text-accent">
                {board.title}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted">
                <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {board.itemCount === 0
                  ? "No pictures yet"
                  : board.itemCount === 1
                    ? "1 picture"
                    : `${board.itemCount} pictures`}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * What an empty board looks like: the tier plates it will be sorted into.
 *
 * The colours are the starter tiers', so the placeholder is a picture of the
 * thing itself rather than a generic grey box with an icon in the middle.
 */
function EmptyPlate() {
  const tiers = [
    { label: "S", color: "#ef4444" },
    { label: "A", color: "#f59e0b" },
    { label: "B", color: "#eab308" },
    { label: "C", color: "#22c55e" },
  ];
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 p-3" aria-hidden>
      {tiers.map((tier) => (
        <div key={tier.label} className="flex items-center gap-1.5">
          <span
            className="flex h-4 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white/90"
            style={{ backgroundColor: tier.color }}
          >
            {tier.label}
          </span>
          <span className="h-4 flex-1 rounded bg-surface" />
        </div>
      ))}
    </div>
  );
}
