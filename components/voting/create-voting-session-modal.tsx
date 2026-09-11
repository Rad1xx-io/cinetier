"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Loader2, Share2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Poster } from "@/components/movie-card/poster";
import { createVotingSession } from "@/lib/supabase/voting";
import {
  buildVotingPool,
  categoryForPool,
  DEFAULT_POOL_SIZE,
  isRatedTier,
  MAX_POOL_SIZE,
  MIN_POOL_SIZE,
} from "@/lib/voting/pool";
import { trackVotingSessionCreated, trackLinkCopied, trackShareClicked } from "@/lib/analytics/events";
import type { MediaType, RankedTitle } from "@/lib/types";
import { shareUrl } from "@/lib/seo/site";
import { cn } from "@/lib/utils/cn";

const CATEGORY_LABELS: Record<MediaType, string> = {
  movie: "Films",
  tv: "TV",
  anime: "Anime",
  game: "Games",
};
const CATEGORIES: MediaType[] = ["movie", "tv", "anime", "game"];

interface CreateVotingSessionModalProps {
  open: boolean;
  onClose: () => void;
  /** Custom boards are out of v1 (see migration 033's header) — always the regular list. */
  titles: RankedTitle[];
}

function canWebShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * Turns a slice of the creator's own board into a link other people can vote
 * on — the room, not a copy of the list itself. See migration 033's header
 * for the trust model a link like this one accepts.
 */
export function CreateVotingSessionModal({ open, onClose, titles }: CreateVotingSessionModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  const byCategory = useMemo(() => {
    const grouped: Record<MediaType, RankedTitle[]> = { movie: [], tv: [], anime: [], game: [] };
    for (const title of titles) {
      if (isRatedTier(title.tier) && title.mediaType in grouped) grouped[title.mediaType].push(title);
    }
    return grouped;
  }, [titles]);

  const [category, setCategory] = useState<MediaType>(
    () => CATEGORIES.find((c) => byCategory[c]?.length > 0) ?? "movie"
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [limit, setLimit] = useState(DEFAULT_POOL_SIZE);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset on each opening, same reasoning as CreateBattleModal: a stale pool
  // or a leftover link from the previous session is worse than recomputing.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCategory(CATEGORIES.find((c) => byCategory[c]?.length > 0) ?? "movie");
      setTitle("");
      setDescription("");
      setLimit(DEFAULT_POOL_SIZE);
      setExcluded(new Set());
      setError(null);
      setSessionId(null);
      setCopied(false);
    }
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const categoryPool = byCategory[category] ?? [];
  const selected = categoryPool.slice(0, limit).filter((t) => !excluded.has(String(t.tmdbId) + t.mediaType));
  const enough = selected.length >= MIN_POOL_SIZE;

  function toggle(t: RankedTitle) {
    const key = String(t.tmdbId) + t.mediaType;
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit() {
    if (!enough || creating) return;
    setCreating(true);
    setError(null);

    const pool = buildVotingPool(selected);
    const id = await createVotingSession({
      title: title.trim() || `Vote: ${CATEGORY_LABELS[category]}`,
      description: description.trim(),
      category: categoryForPool(pool),
      pool,
    });

    setCreating(false);
    if (!id) {
      setError("Could not create the voting session. Check your connection and try again.");
      return;
    }

    setSessionId(id);
    trackVotingSessionCreated({ sessionId: id, category: categoryForPool(pool), itemsCount: pool.length });
  }

  const link = sessionId ? shareUrl(`/vote/${sessionId}`) : "";

  async function handleShare() {
    if (!sessionId) return;
    trackShareClicked("tier_list", sessionId);

    if (canWebShare()) {
      try {
        await navigator.share({
          title: "TierListOnline — Group vote",
          text: "Vote on this line-up with me:",
          url: link,
        });
        return;
      } catch {
        // A dismissed share sheet rejects too — fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(link);
      trackLinkCopied("tier_list", sessionId);
      setCopied(true);
    } catch {
      window.prompt("Copy the link:", link);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto max-h-[92dvh] w-[min(34rem,94vw)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <Users className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              {sessionId ? "Link ready" : "Group vote"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {sessionId
                ? "Send it around — everyone who opens it can vote, no account needed. Close it whenever you're ready to see the result."
                : "Pick a line-up. Anyone with the link can vote on it, no account needed — you decide when to close it and see the result."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {sessionId ? (
          <div className="mt-5">
            <p className="truncate rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm">
              {link}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button onClick={handleShare} className="flex-1">
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : canWebShare() ? (
                  <Share2 className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copied ? "Link copied" : "Share the link"}
              </Button>
              <Button variant="secondary" onClick={onClose} className="sm:w-auto">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <label htmlFor="voting-title" className="mt-4 block text-xs text-muted">
              Title
            </label>
            <input
              id="voting-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Vote: ${CATEGORY_LABELS[category]}`}
              maxLength={120}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />

            <div
              className="mt-3 flex flex-wrap gap-1 rounded-lg border border-border p-0.5"
              role="group"
              aria-label="Category"
            >
              {CATEGORIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setCategory(value);
                    // Exclusions are per-pool; carrying them across categories
                    // would silently drop items the user never saw.
                    setExcluded(new Set());
                  }}
                  disabled={(byCategory[value]?.length ?? 0) === 0}
                  aria-pressed={category === value}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                    category === value ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
                  )}
                >
                  {CATEGORY_LABELS[value]}
                  <span className="ml-1 opacity-70">{byCategory[value]?.length ?? 0}</span>
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label htmlFor="voting-size" className="flex items-baseline justify-between text-xs">
                <span className="text-muted">Maximum entries</span>
                <span className="font-semibold tabular-nums">{limit}</span>
              </label>
              <input
                id="voting-size"
                type="range"
                min={MIN_POOL_SIZE}
                max={MAX_POOL_SIZE}
                step={1}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="mt-1.5 h-9 w-full accent-[var(--accent)]"
              />
            </div>

            {categoryPool.length === 0 ? (
              <p className="mt-4 rounded-lg border border-border bg-surface-raised px-3 py-3 text-sm text-muted">
                Nothing rated in this category yet.
              </p>
            ) : (
              <>
                <p className="mt-4 text-xs text-muted">
                  {selected.length} of {Math.min(categoryPool.length, limit)} selected. Untick anything you
                  would rather leave out.
                </p>
                <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto overscroll-contain pr-1 scrollbar-thin sm:max-h-64">
                  {categoryPool.slice(0, limit).map((t) => {
                    const key = String(t.tmdbId) + t.mediaType;
                    const isSelected = !excluded.has(key);
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => toggle(t)}
                          aria-pressed={isSelected}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg border p-1.5 text-left transition-colors",
                            isSelected ? "border-accent/40 bg-surface-raised" : "border-border opacity-50"
                          )}
                        >
                          <Poster
                            posterPath={t.posterPath}
                            title={t.title}
                            className="w-8 shrink-0"
                            sizes="32px"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                          {isSelected && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {!enough && categoryPool.length > 0 && (
              <p className="mt-3 text-xs text-muted">At least {MIN_POOL_SIZE} entries are needed.</p>
            )}

            {error && <p className="mt-3 text-xs text-tier-s">{error}</p>}

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={creating || !enough}>
                {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Create voting link
              </Button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
