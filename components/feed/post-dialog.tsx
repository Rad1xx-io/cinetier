"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Eye, Flag, GitFork, Heart, Loader2, MessageCircle, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addComment,
  deletePost,
  getAuthorTitles,
  getComments,
  registerPostView,
  type FeedPost,
  type PostComment,
} from "@/lib/supabase/feed";

/** Far above any hand-built tier list, so "the whole board" is not a promise
 *  the query quietly breaks on a long one. */
const FULL_BOARD_CAP = 500;
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import { avatarInitials, buildTierRows } from "@/lib/feed/post-preview";
import { TierBoard } from "@/components/feed/tier-board";
import { DonateButton } from "@/components/profile/donate-button";
import { titlesCountLabel } from "@/lib/utils/plural";
import type { RankedTitle } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { CustomPostBoard } from "@/components/feed/custom-post-board";
import type { PublishedBoard } from "@/lib/supabase/custom-lists";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { ReportButton } from "@/components/ui/report-button";
import { ReportDialog } from "@/components/ui/report-dialog";
import { downloadPng, renderBoardPng } from "@/lib/utils/board-export";
import { describeExportFailure } from "@/lib/utils/export-error";
import { trackImageExported } from "@/lib/analytics/events";

interface PostDialogProps {
  post: FeedPost | null;
  /** The author's board in full — the dialog shows every tier, uncapped. */
  titles: RankedTitle[];
  /**
   * Present instead of `titles` when the post is a board of uploaded pictures.
   *
   * Without this the dialog fell back to the author's ranked titles whatever
   * the post was about, so opening a board of somebody's photographs showed
   * their film list, or an empty frame if they had never ranked a film.
   */
  published?: PublishedBoard;
  onClose: () => void;
  liked: boolean;
  onToggleLike: (post: FeedPost) => void;
  onCommentAdded: (postId: string) => void;
  /** Called once the author has removed their own post. */
  onDeleted: (postId: string) => void;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function PostDialog({
  post,
  titles,
  published,
  onClose,
  liked,
  onToggleLike,
  onCommentAdded,
  onDeleted,
}: PostDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { user } = useSupabaseSession();
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const boardRef = useRef<HTMLElement | null>(null);
  /**
   * The feed loads a bounded slice per author to keep one screen to one query.
   * The dialog promises the whole board, so it fetches the rest on open and
   * falls back to the slice until that lands — no empty frame, no spinner.
   */
  const [fullTitles, setFullTitles] = useState<RankedTitle[] | null>(null);
  const viewedRef = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (post && !el.open) el.showModal();
    if (!post && el.open) el.close();
  }, [post]);

  // Clearing the previous post's thread is an adjustment to a changed prop, not
  // a side effect: doing it in an effect would paint one frame of the old
  // comments under the new post's title before the reset landed.
  const [shownPostId, setShownPostId] = useState<string | null>(post?.id ?? null);
  if ((post?.id ?? null) !== shownPostId) {
    setShownPostId(post?.id ?? null);
    setComments(null);
    setDraft("");
    setFullTitles(null);
    setReportOpen(false);
  }

  useEffect(() => {
    if (!post) return;
    // Every write lands in an async callback, after the effect body has returned.
    getComments(post.id).then(setComments);
    getAuthorTitles([post.userId], FULL_BOARD_CAP).then((rows) => {
      // Only ever an enrichment. An empty result means the fetch found nothing
      // more — keeping the slice the feed already had beats blanking a board
      // that was rendering fine.
      if (rows.length > 0) setFullTitles(rows);
    });

    // Counted once per post per mount of this dialog. The ref keeps Strict
    // Mode's double effect — and a re-render — from counting the same look twice.
    if (viewedRef.current !== post.id) {
      viewedRef.current = post.id;
      void registerPostView(post.id);
    }
  }, [post]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!post || !draft.trim()) return;

    setSending(true);
    const created = await addComment(post.id, draft);
    setSending(false);

    if (created) {
      setComments((prev) => [...(prev ?? []), created]);
      setDraft("");
      onCommentAdded(post.id);
    }
  }

  async function handleDownload(itemsCount: number) {
    const node = boardRef.current;
    if (!node) return;

    setExporting(true);
    setDownloadError("");
    // Same convention as the tier-list and custom-board exporters: the
    // watermark sits at zero opacity so it never disturbs the live layout, and
    // is only made visible for the moment of the capture.
    const watermark = node.querySelector<HTMLElement>("[data-export-watermark]");
    if (watermark) watermark.style.opacity = "1";

    try {
      const dataUrl = await renderBoardPng(node);
      downloadPng(dataUrl, "tierlistonline");
      trackImageExported({ itemsCount, succeeded: true });
    } catch (err) {
      const reason = describeExportFailure(err);
      trackImageExported({ itemsCount, succeeded: false, reason: reason.slice(0, 120) });
      setDownloadError(`Could not create the image (${reason.slice(0, 80)}).`);
    } finally {
      if (watermark) watermark.style.opacity = "0";
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!post || deleting) return;
    // Asked the way every other irreversible thing here is asked.
    const confirmed = window.confirm(
      `Delete “${post.title}”? It goes out of the feed for everyone, along with its comments. Your board itself is not touched.`
    );
    if (!confirmed) return;

    setDeleting(true);
    const removed = await deletePost(post.id);
    setDeleting(false);
    if (!removed) return;

    onDeleted(post.id);
    onClose();
  }

  const rows = buildTierRows(fullTitles ?? titles);
  const total = rows.reduce((sum, row) => sum + row.titles.length, 0);
  const boardItemsCount = published ? published.items.length : total;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto max-h-[92dvh] w-[min(36rem,94vw)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {post && (
        <div className="p-4 sm:p-5">
          {published ? (
            <section ref={boardRef} className="mb-4 rounded-xl bg-surface-raised p-2">
              {/* No count underneath, deliberately. The published one counts
                  pictures that a takedown or a deletion may since have emptied
                  out of the board, and a count of what is left would report the
                  moderation of somebody else's board as if it were its size.
                  The tiers show what there is. */}
              <CustomPostBoard board={published} variant="full" />
            </section>
          ) : (
            rows.length > 0 && (
              <section ref={boardRef} className="mb-4 rounded-xl bg-surface-raised p-2">
                <TierBoard rows={rows} variant="full" />
                <p className="mt-2 text-center text-[11px] text-muted">
                  {titlesCountLabel(total)} across {rows.length === 1 ? "one tier" : `${rows.length} tiers`}
                </p>
              </section>
            )
          )}

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold sm:text-lg">{post.title}</h2>
              <Link
                href={`/u/${post.username}`}
                className="mt-1.5 flex items-center gap-2 text-xs text-muted hover:text-accent"
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised text-[10px] font-bold text-accent"
                  aria-hidden
                >
                  {avatarInitials(post.displayName, post.username)}
                </span>
                {post.displayName || `@${post.username}`} · {formatWhen(post.createdAt)}
              </Link>
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

          {post.description && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {post.description}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            <button
              type="button"
              onClick={() => onToggleLike(post)}
              aria-pressed={liked}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 transition-colors hover:text-foreground",
                liked && "border-tier-s/40 text-tier-s"
              )}
            >
              <Heart className={cn("h-3.5 w-3.5", liked && "fill-current")} aria-hidden />
              {post.likesCount}
            </button>
            <span className="flex items-center gap-1.5 px-2">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {post.viewsCount}
            </span>
            <span className="flex items-center gap-1.5 px-2">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              {comments?.length ?? post.commentsCount}
            </span>

            <DonateButton
              authorId={post.userId}
              authorName={post.displayName || `@${post.username}`}
              donationUrl={post.donationUrl}
              tierListId={post.id}
              variant="compact"
              className="ml-auto"
            />

            {/* Same reasoning as on the card: this opens the author's ranked
                titles, which a board of their own photographs is not. */}
            {post.category !== "custom" && post.isPublic && (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/u/${post.username}`}>
                  <GitFork className="h-3.5 w-3.5" aria-hidden />
                  {post.allowFork ? "Open and fork" : "Open the list"}
                </Link>
              </Button>
            )}

            <OverflowMenu
              label="More post actions"
              items={[
                {
                  label: exporting ? "Rendering…" : "Download",
                  icon: Download,
                  onSelect: () => void handleDownload(boardItemsCount),
                  disabled: exporting || boardItemsCount === 0,
                },
                // Not offered to the author about their own post — same as a
                // custom board's own report button.
                ...(user?.id !== post.userId
                  ? [
                      {
                        label: "Report",
                        icon: Flag,
                        onSelect: () => setReportOpen(true),
                      },
                    ]
                  : []),
                // Offered to the author and nobody else. Publishing used to be
                // one-way: hiding the board emptied the pictures out of the
                // post and left its title in the feed for good.
                ...(user?.id === post.userId
                  ? [
                      {
                        label: deleting ? "Deleting…" : "Delete post",
                        icon: Trash2,
                        onSelect: () => void handleDelete(),
                        disabled: deleting,
                        destructive: true,
                      },
                    ]
                  : []),
              ]}
            />
          </div>

          <ReportDialog
            open={reportOpen}
            onClose={() => setReportOpen(false)}
            subjectType="post"
            subjectId={post.id}
            label={`Report “${post.title}”`}
          />

          {downloadError && <p className="mt-2 text-xs text-red-400">{downloadError}</p>}

          <section className="mt-5 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Comments</h3>

            {comments === null ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : comments.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nobody has replied yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {comments.map((comment) => (
                  <li key={comment.id} className="flex gap-2.5">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[10px] font-bold text-accent"
                      aria-hidden
                    >
                      {avatarInitials(comment.displayName, comment.username)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted">
                        {comment.displayName || `@${comment.username}`} ·{" "}
                        {formatWhen(comment.createdAt)}
                      </p>
                      <p className="mt-0.5 whitespace-pre-line break-words text-sm">
                        {comment.text}
                      </p>
                    </div>

                    {/* Not offered on your own comment — same as the post and
                        the custom-board items above. */}
                    {user?.id !== comment.userId && (
                      <ReportButton
                        subjectType="post_comment"
                        subjectId={comment.id}
                        label="Report this comment"
                        className="shrink-0 hover:bg-surface-raised"
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}

            {user ? (
              <form onSubmit={handleSend} className="mt-4 flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a comment…"
                  rows={2}
                  maxLength={1000}
                  aria-label="Comment text"
                  className="min-h-11 flex-1 resize-y rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Send
                </Button>
              </form>
            ) : (
              <p className="mt-4 rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-xs text-muted">
                Sign in to leave a comment.
              </p>
            )}
          </section>
        </div>
      )}
    </dialog>
  );
}
