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
            <h2 className="text-lg font-semibold">У вас уже есть свой тир-лист</h2>
            <p className="mt-1 text-sm text-muted">
              В нём {currentCount} поз. Список {authorName} добавит ещё {incomingCount}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
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
              <span className="block text-sm font-medium">Объединить</span>
              <span className="mt-0.5 block text-xs text-muted">
                Ваши оценки остаются как есть. Добавится только то, чего у вас ещё нет.
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
              <span className="block text-sm font-medium">Заменить</span>
              <span className="mt-0.5 block text-xs text-muted">
                Ваш текущий тир-лист будет стёрт и заменён копией чужого.
              </span>
            </span>
          </button>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Замену не отменить. Если хотите подстраховаться, сначала выгрузите резервную копию в
          настройках.
        </p>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Отмена
          </Button>
        </div>
      </div>
    </dialog>
  );
}
