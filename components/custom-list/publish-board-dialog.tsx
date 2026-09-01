"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import {
  POST_DESCRIPTION_MAX,
  POST_TITLE_MAX,
  RULES_CONFIRMATION_LABEL,
  validatePost,
} from "@/lib/feed/post-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PublishBoardDialogProps {
  /** Seeds the title, since it is usually what the board should be called. */
  boardTitle: string;
  busy: boolean;
  onCancel: () => void;
  onPublish: (title: string, description: string, rulesConfirmed: boolean) => void;
}

/**
 * Naming a board before it goes to the feed.
 *
 * The title used to be taken from the board silently, which read as one less
 * thing to fill in and was really one more way to fail: board names may be a
 * single character, post titles may not, and a board called "ez" was refused
 * by the database in language nobody could act on. Asked for here instead,
 * with the board's own name already in the box, and checked by the same rules
 * the feed's dialog uses — so the objection arrives while the text is still on
 * screen to be changed.
 */
export function PublishBoardDialog({
  boardTitle,
  busy,
  onCancel,
  onPublish,
}: PublishBoardDialogProps) {
  const [title, setTitle] = useState(boardTitle);
  const [description, setDescription] = useState("");
  const [rulesConfirmed, setRulesConfirmed] = useState(false);
  const validation = validatePost(title, description);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">Publish to the feed</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <p className="mt-2 text-xs text-muted">
          The post keeps this board&rsquo;s shape as it is now. Editing the board afterwards will
          not change the post.
        </p>

        <label htmlFor="board-post-title" className="mt-4 block text-xs text-muted">
          Title
        </label>
        <Input
          id="board-post-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={POST_TITLE_MAX}
          autoFocus
          required
          className="mt-1"
        />

        <label htmlFor="board-post-description" className="mt-3 block text-xs text-muted">
          Description <span className="opacity-70">&mdash; optional</span>
        </label>
        <textarea
          id="board-post-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={POST_DESCRIPTION_MAX}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />

        {/* Shown once there is something to say, rather than scolding an empty
            box the moment the dialog opens. */}
        {!validation.ok && title.trim().length > 0 && (
          <p className="mt-3 text-xs text-red-400">{validation.error}</p>
        )}

        <label className="mt-4 flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={rulesConfirmed}
            onChange={(e) => setRulesConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
          />
          <span>{RULES_CONFIRMATION_LABEL}</span>
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onPublish(title, description, rulesConfirmed)}
            disabled={busy || !validation.ok || !rulesConfirmed}
          >
            <Send className="mr-1.5 h-4 w-4" aria-hidden />
            {busy ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
