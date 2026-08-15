"use client";

import { useEffect, useRef } from "react";
import { Layers, Replace, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ForkStrategy } from "@/lib/storage/fork";

interface ForkConflictDialogProps {
  open: boolean;
  onClose: () => void;
  onChoose: (strategy: ForkStrategy) => void;
  /** How many titles the viewer already has, and how many are on offer. */
  currentCount: number;
  incomingCount: number;
  authorName: string;
}

/**
 * Asked only when there is something to lose.
 *
 * A fork onto an empty board needs no decision, so this never appears then; the
 * dialog exists purely because replacing an existing list is destructive and
 * must not happen on a single click.
 */
export function ForkConflictDialog({
  open,
  onClose,
  onChoose,
  currentCount,
  incomingCount,
  authorName,
}: ForkConflictDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(30rem,94vw)] rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">You already have a tier list</h2>
            <p className="mt-1 text-sm text-muted">
              Yours holds {currentCount}. {authorName}’s list would add {incomingCount} more.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={() => onChoose("merge")}
            className="flex w-full items-start gap-3 rounded-xl border border-accent/40 bg-surface-raised p-3 text-left transition-colors hover:bg-white/5"
          >
            <Layers className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>
              <span className="block text-sm font-medium">Merge</span>
              <span className="mt-0.5 block text-xs text-muted">
                Your own ratings stay as they are. Only what you do not already have is added.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChoose("replace")}
            className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-white/5"
          >
            <Replace className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span>
              <span className="block text-sm font-medium">Replace</span>
              <span className="mt-0.5 block text-xs text-muted">
                Your current tier list is erased and replaced with a copy of theirs.
              </span>
            </span>
          </button>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Replacing cannot be undone. If you want a safety net, export a backup from settings
          first.
        </p>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </dialog>
  );
}
