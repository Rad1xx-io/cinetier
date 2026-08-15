"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_PRESETS,
  SCORE_DEFAULT,
  SCORE_MAX,
  SCORE_MIN,
  SCORE_STEP,
  clampScore,
  normalizeCriterionName,
  type CriterionScore,
} from "@/lib/types/criteria";
import { trackCriterionAdded } from "@/lib/analytics/events";
import { cn } from "@/lib/utils/cn";

interface CriteriaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (scores: CriterionScore[]) => void;
  initialScores?: CriterionScore[];
}

/** `crypto.randomUUID` needs a secure context; a counter-free fallback keeps custom ids unique without one. */
function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CriteriaDrawer({
  isOpen,
  onClose,
  onSave,
  initialScores,
}: CriteriaDrawerProps) {
  const [scores, setScores] = useState<CriterionScore[]>(initialScores ?? []);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  /**
   * Reloads the incoming scores each time the drawer opens.
   *
   * Adjusted during render rather than in an effect: an effect would paint one
   * frame of the previous session's values before correcting them, and this
   * codebase's lint rules reject setState inside an effect body for that reason.
   */
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setScores(initialScores ?? []);
      setDraftName("");
      setError(null);
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);

    // Stops the page behind the panel from scrolling with it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  const activeIds = new Set(scores.map((s) => s.criterionId));
  const activeNames = new Set(scores.map((s) => normalizeCriterionName(s.name)));

  function addCriterion(criterionId: string, name: string) {
    // Guards on both id and name: a preset could share a name with something
    // the user already typed by hand, and that is still a duplicate.
    if (activeIds.has(criterionId) || activeNames.has(normalizeCriterionName(name))) {
      setError(`“${name}” is already on the list.`);
      return;
    }
    setScores((prev) => [...prev, { criterionId, name, score: SCORE_DEFAULT }]);
    setError(null);
    trackCriterionAdded(name, false);
  }

  function handleAddCustom(event: React.FormEvent) {
    event.preventDefault();
    const name = draftName.trim();

    if (!name) {
      setError("Enter a name for the criterion.");
      return;
    }
    if (activeNames.has(normalizeCriterionName(name))) {
      setError(`“${name}” is already on the list.`);
      return;
    }

    setScores((prev) => [...prev, { criterionId: createId(), name, score: SCORE_DEFAULT }]);
    trackCriterionAdded(name, true);
    setDraftName("");
    setError(null);
    nameInputRef.current?.focus();
  }

  function updateScore(criterionId: string, value: number) {
    setScores((prev) =>
      prev.map((s) => (s.criterionId === criterionId ? { ...s, score: clampScore(value) } : s))
    );
  }

  function removeCriterion(criterionId: string) {
    setScores((prev) => prev.filter((s) => s.criterionId !== criterionId));
    setError(null);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="criteria-drawer-title">
      <button
        type="button"
        aria-label="Close the criteria panel"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />

      <aside className="animate-fade-in relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="criteria-drawer-title" className="text-lg font-semibold">
              Rating criteria
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Break a rating into parts — 1 to 10, in steps of 0.1.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
              Active criteria
            </h3>

            {scores.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
                Nothing chosen yet. Add one from the presets below, or write your own.
              </p>
            ) : (
              <ul className="mt-3 space-y-4">
                {scores.map((criterion) => (
                  <li key={criterion.criterionId}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {criterion.name}
                      </span>
                      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-accent">
                        {criterion.score.toFixed(1)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCriterion(criterion.criterionId)}
                        aria-label={`Remove the “${criterion.name}” criterion`}
                        className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-tier-s/10 hover:text-tier-s focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                    <input
                      type="range"
                      min={SCORE_MIN}
                      max={SCORE_MAX}
                      step={SCORE_STEP}
                      value={criterion.score}
                      onChange={(e) => updateScore(criterion.criterionId, Number(e.target.value))}
                      aria-label={`“${criterion.name}” score`}
                      className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      style={{ accentColor: "var(--accent)" }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Preset sets</h3>
            <div className="mt-3 space-y-3">
              {DEFAULT_PRESETS.map((group) => (
                <div key={group.id}>
                  <p className="text-xs text-muted">{group.label}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {group.criteria.map((preset) => {
                      // A preset already on the board, by id or by the name the
                      // user typed themselves, is spent.
                      const used =
                        activeIds.has(preset.id) ||
                        activeNames.has(normalizeCriterionName(preset.name));
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          disabled={used}
                          onClick={() => addCriterion(preset.id, preset.name)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                            used
                              ? "cursor-not-allowed border-border text-muted/50"
                              : "border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
                          )}
                        >
                          {preset.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Your own criterion</h3>
            <form onSubmit={handleAddCustom} className="mt-3 flex gap-2">
              <Input
                ref={nameInputRef}
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="For example, “Cast chemistry”"
                aria-label="Criterion name"
                maxLength={40}
              />
              <Button type="submit" variant="secondary" disabled={!draftName.trim()}>
                <Plus className="h-4 w-4" aria-hidden />
                Add
              </Button>
            </form>
            {error && (
              <p role="alert" className="mt-2 text-sm text-tier-s">
                {error}
              </p>
            )}
          </section>
        </div>

        <footer className="border-t border-border px-5 py-4">
          <Button className="w-full justify-center" onClick={() => onSave(scores)}>
            Save criteria
            {scores.length > 0 && ` (${scores.length})`}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
