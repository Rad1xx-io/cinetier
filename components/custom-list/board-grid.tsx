"use client";

import { useState } from "react";
import Link from "next/link";
import { Globe, ImageIcon, Lock, Trash2 } from "lucide-react";
import type { CustomBoardSummary } from "@/lib/supabase/custom-lists";
import { deleteCustomBoard } from "@/lib/supabase/custom-lists";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { OverflowMenu } from "@/components/ui/overflow-menu";
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
 *
 * Owns its own list in state, seeded from the server-rendered props: creating
 * a board here has always meant leaving this page and coming back to it, but
 * deleting one should not cost a full reload of everyone else's boards to
 * reflect one gone — the same reasoning feed-view.tsx already uses for a
 * deleted post.
 */
export function BoardGrid({ boards: initial }: BoardGridProps) {
  const [boards, setBoards] = useState(initial);
  const [rendered, setRendered] = useState(initial);
  if (rendered !== initial) {
    setRendered(initial);
    setBoards(initial);
  }

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(board: CustomBoardSummary) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || deletingId) return;

    const confirmed = window.confirm(
      board.isPublished
        ? `Delete “${board.title}”? It also removes its post from the feed, along with its comments. This cannot be undone.`
        : `Delete “${board.title}”? This board was never published. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(board.id);
    setError(null);
    const outcome = await deleteCustomBoard(supabase, board.id);
    setDeletingId(null);

    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setBoards((prev) => prev.filter((b) => b.id !== board.id));
  }

  return (
    <>
      {error && <p className="mb-3 text-xs text-tier-s">{error}</p>}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((board) => (
          <li key={board.id} className="relative">
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

            {/* A sibling of the link, not a child of it — a button cannot nest
                inside an anchor without breaking both of their click targets. */}
            <div className="absolute left-2 top-2">
              <OverflowMenu
                label={`More actions for ${board.title}`}
                items={[
                  {
                    label: deletingId === board.id ? "Deleting…" : "Delete board",
                    icon: Trash2,
                    onSelect: () => void handleDelete(board),
                    disabled: deletingId !== null,
                    destructive: true,
                  },
                ]}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
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
