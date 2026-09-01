"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publishPost, type PostCategory } from "@/lib/supabase/feed";
import type { RankedTitle } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import {
  POST_DESCRIPTION_MAX,
  POST_TITLE_MAX,
  validatePost,
} from "@/lib/feed/post-preview";
import { trackListPublished, trackPostPublished } from "@/lib/analytics/events";
import { cn } from "@/lib/utils/cn";

const CATEGORY_OPTIONS: { value: PostCategory; label: string }[] = [
  { value: "mixed", label: "Everything" },
  { value: "movie", label: "Films" },
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
  { value: "game", label: "Games" },
  { value: "youtube", label: "YouTube" },
];

interface PublishPostDialogProps {
  open: boolean;
  onClose: () => void;
  /** The category the board is mostly made of — the sensible default. */
  suggestedCategory?: PostCategory;
  /** The board exactly as it stands now — frozen into the post at Publish. */
  titles: RankedTitle[];
  /** Same freezing, for the other store a board can be made of. */
  channels?: RankedChannel[];
}

export function PublishPostDialog({
  open,
  onClose,
  suggestedCategory = "mixed",
  titles,
  channels = [],
}: PublishPostDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<PostCategory>(suggestedCategory);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on each opening rather than in an effect, so a previous draft never
  // resurfaces under a new post.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle("");
      setDescription("");
      setCategory(suggestedCategory);
      setError(null);
    }
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const validation = validatePost(title, description);

  /*
   * Same bug as Clear List (see the comment above `clearableCount` in
   * tier-list-actions.tsx): the picker's category never reached the
   * publish call, so every post snapshotted the whole unfiltered board
   * no matter which button was clicked. "Everything" is the one option
   * that is supposed to mean that — every other one should snapshot only
   * its own catalog.
   *
   * Channels live in their own store with no `mediaType` to filter by —
   * filtering `titles` already yields `[]` for "youtube" on its own, since
   * no title's `mediaType` is ever "youtube". They snapshot for "youtube"
   * and for "mixed" ("Everything" means everything on the board, channels
   * included, not just the four catalogues that happen to share a table).
   *
   * Computed here, at render time, rather than inside `handleSubmit`: the
   * empty-category check below needs the same value the submit does, and
   * computing it twice is exactly how the Clear List bug happened in the
   * first place — two places doing the same filter, only one of them kept
   * in sync when the picker changed.
   */
  const snapshotTitles =
    category === "mixed" ? titles : titles.filter((t) => t.mediaType === category);
  const snapshotChannels = category === "mixed" || category === "youtube" ? channels : [];
  const hasContent = snapshotTitles.length > 0 || snapshotChannels.length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    if (!hasContent) {
      setError("Nothing is ranked in this category yet — pick a different one, or rank something first.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await publishPost({
      title,
      description,
      category,
      titles: snapshotTitles,
      channels: snapshotChannels,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    trackListPublished(result.postId);
    trackPostPublished(result.postId, category);
    onClose();
    router.push("/feed");
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto max-h-[92dvh] w-[min(32rem,94vw)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={handleSubmit} className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold sm:text-lg">Publish to the feed</h2>
            <p className="mt-1 text-sm text-muted">
              The post links to your public list. If it is closed, readers see only the title and
              description.
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

        <label htmlFor="post-title" className="mt-4 block text-xs text-muted">
          Title
        </label>
        <Input
          id="post-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="For example: “My top sci-fi of the last 20 years”"
          maxLength={POST_TITLE_MAX}
          autoFocus
          required
          className="mt-1"
        />

        <label htmlFor="post-description" className="mt-3 block text-xs text-muted">
          Description <span className="opacity-70">— optional</span>
        </label>
        <textarea
          id="post-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why does the list look the way it does?"
          rows={4}
          maxLength={POST_DESCRIPTION_MAX}
          className="mt-1 w-full resize-y rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />

        <fieldset className="mt-3">
          <legend className="text-xs text-muted">Category</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategory(option.value)}
                aria-pressed={category === option.value}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  category === option.value
                    ? "border-transparent bg-accent text-accent-foreground"
                    : "border-border text-muted hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {/* Rare on open — `suggestedCategory` already lands on whichever
              catalog has the most in it — so this only shows up once someone
              deliberately picks a category they have not ranked anything in. */}
          {!hasContent && (
            <p className="mt-1.5 text-xs text-muted">
              Nothing is ranked in tiers for &ldquo;{CATEGORY_OPTIONS.find((o) => o.value === category)?.label}&rdquo; yet.
            </p>
          )}
        </fieldset>

        {error && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-tier-s">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving || !validation.ok || !hasContent}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden />
            )}
            Publish
          </Button>
        </div>
      </form>
    </dialog>
  );
}
