"use client";

import { CATALOG_FILTERS, type ContentType } from "@/lib/utils/content-type";
import { Button } from "@/components/ui/button";

interface CatalogEmptyStateProps {
  /** The list being shown, which has nothing in it. */
  catalog: ContentType;
  counts: Record<ContentType, number>;
  onPick: (next: ContentType) => void;
}

/**
 * What an empty list says for itself.
 *
 * The board opens on the list it was left on, which means it can open on an
 * empty one — deliberately, since the alternative is moving people between
 * lists without asking. What must never happen is an empty board that looks
 * like a mistake, so this names the list, says what is elsewhere, and offers
 * one click to each of them. The dropdown does the same job in three.
 */
export function CatalogEmptyState({ catalog, counts, onPick }: CatalogEmptyStateProps) {
  const label = (value: ContentType) =>
    CATALOG_FILTERS.find((entry) => entry.value === value)?.label ?? value;

  const stocked = CATALOG_FILTERS.filter(
    (entry) => entry.value !== catalog && counts[entry.value] > 0
  );

  return (
    <div className="mx-auto mt-4 max-w-xl rounded-xl border border-border bg-surface-raised px-6 py-10 text-center">
      <h2 className="text-base font-semibold">Nothing in {label(catalog)} yet</h2>
      <p className="mt-1.5 text-sm text-muted">
        {stocked.length > 0
          ? "This list is empty. Your other lists are not."
          : `Add something to ${label(catalog)} and it will show up here.`}
      </p>

      {stocked.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {stocked.map((entry) => (
            <Button
              key={entry.value}
              variant="secondary"
              size="sm"
              onClick={() => onPick(entry.value)}
            >
              {entry.label}
              <span className="ml-1.5 text-xs text-muted">{counts[entry.value]}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
