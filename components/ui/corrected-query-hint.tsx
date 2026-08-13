import { Lightbulb } from "lucide-react";

interface CorrectedQueryHintProps {
  /** The spelling that actually found something, or null when the typed one worked. */
  correctedQuery: string | null | undefined;
}

/**
 * Explains where unexpected results came from.
 *
 * Deliberately not a "did you mean?" link: the corrected spelling has already
 * been searched and its results are on screen, so offering it as an action
 * would repeat a search that already ran. This only accounts for why a query
 * for "майкрафт" returned Minecraft.
 */
export function CorrectedQueryHint({ correctedQuery }: CorrectedQueryHintProps) {
  if (!correctedQuery) return null;

  return (
    <p className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
      <Lightbulb className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span>
        Возможно, вы искали:{" "}
        <span className="font-medium text-foreground">{correctedQuery}</span>
      </span>
    </p>
  );
}
