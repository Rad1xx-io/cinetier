"use client";

import Link from "next/link";
import { Eye, GitFork, Heart, MessageCircle } from "lucide-react";
import { ContentTypeBadge } from "@/components/ui/content-type-badge";
import { TierBoard } from "@/components/feed/tier-board";
import { ChannelBoard } from "@/components/feed/channel-board";
import { CustomPostBoard } from "@/components/feed/custom-post-board";
import type { PublishedBoard } from "@/lib/supabase/custom-lists";
import { DonateButton } from "@/components/profile/donate-button";
import { avatarInitials, buildMiniBoard, buildMiniChannelBoard } from "@/lib/feed/post-preview";
import { titlesCountLabel } from "@/lib/utils/plural";
import type { FeedPost } from "@/lib/supabase/feed";
import type { RankedTitle } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import { cn } from "@/lib/utils/cn";

interface PostCardProps {
  post: FeedPost;
  /** The author's board, unabridged — the card decides how much of it fits. */
  titles: RankedTitle[];
  /** Same, for the channels on a "youtube" or "mixed" post. */
  channels?: RankedChannel[];
  /** Present instead of `titles` when the post is a board of uploaded pictures. */
  published?: PublishedBoard;
  liked: boolean;
  onOpen: (post: FeedPost) => void;
  onToggleLike: (post: FeedPost) => void;
}

export function PostCard({
  post,
  titles,
  channels = [],
  published,
  liked,
  onOpen,
  onToggleLike,
}: PostCardProps) {
  const displayName = post.displayName || `@${post.username}`;
  const board = buildMiniBoard(titles);
  const channelBoard = buildMiniChannelBoard(channels);

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-accent/30">
      <button
        type="button"
        onClick={() => onOpen(post)}
        className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`Open the post “${post.title}”`}
      >
        {/* The board itself is the thumbnail. Rendered as real tier rows rather
            than a strip of posters: the coloured plates are what make a tier
            list recognisable at a glance, and a flat row loses that entirely. */}
        <div className="bg-surface-raised p-2">
          {published ? (
            <CustomPostBoard board={published} variant="compact" />
          ) : board.rows.length === 0 && channelBoard.rows.length === 0 ? (
            <p className="flex h-24 items-center justify-center text-xs text-muted">
              This author has not published their list
            </p>
          ) : (
            <>
              {board.rows.length > 0 && <TierBoard rows={board.rows} variant="compact" />}
              {/* A "youtube" post has no titles at all — this is the whole board
                  then, not an addition to it. A "mixed" one can have both. */}
              {channelBoard.rows.length > 0 && (
                <ChannelBoard
                  rows={channelBoard.rows}
                  variant="compact"
                  className={board.rows.length > 0 ? "mt-1" : undefined}
                />
              )}
            </>
          )}

          {!published && board.hiddenCount + channelBoard.hiddenCount > 0 && (
            // Inside the button that opens the post, so it reads as the way to
            // see the rest — which is exactly what tapping it does.
            <p className="mt-1 rounded bg-background/60 px-2 py-0.5 text-center text-[10px] text-muted">
              …and {titlesCountLabel(board.hiddenCount + channelBoard.hiddenCount)} more
            </p>
          )}
        </div>

        <div className="p-3">
          <h3 className="line-clamp-2 text-sm font-semibold">{post.title}</h3>
          {post.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted">{post.description}</p>
          )}
        </div>
      </button>

      <div className="mt-auto flex items-center gap-2 border-t border-border px-3 py-2.5">
        <Link
          href={`/u/${post.username}`}
          className="flex min-w-0 flex-1 items-center gap-2 text-xs hover:text-accent"
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[10px] font-bold text-accent"
            aria-hidden
          >
            {avatarInitials(post.displayName, post.username)}
          </span>
          <span className="min-w-0 truncate">{displayName}</span>
        </Link>

        {post.category === "custom" ? (
          <span className="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-muted">
            Photos
          </span>
        ) : (
          <ContentTypeBadge type={post.category === "mixed" ? "movie" : post.category} />
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-border px-2 py-1.5 text-xs text-muted">
        <button
          type="button"
          onClick={() => onToggleLike(post)}
          aria-pressed={liked}
          aria-label={liked ? "Remove like" : "Like"}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:text-foreground",
            liked && "text-tier-s"
          )}
        >
          <Heart className={cn("h-3.5 w-3.5", liked && "fill-current")} aria-hidden />
          {post.likesCount}
        </button>

        <button
          type="button"
          onClick={() => onOpen(post)}
          className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:text-foreground"
          aria-label="Comments"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          {post.commentsCount}
        </button>

        <span className="flex items-center gap-1 px-2 py-1" title="Views">
          <Eye className="h-3.5 w-3.5" aria-hidden />
          {post.viewsCount}
        </span>

        {/* Renders nothing when the author set no link, so the row simply
            closes up — flex gaps only fall between children that exist. */}
        <DonateButton
          authorId={post.userId}
          authorName={post.displayName || `@${post.username}`}
          donationUrl={post.donationUrl}
          tierListId={post.id}
          className="ml-auto"
        />

        {/* Not offered on a board of photographs: it links to the author's
            ranked titles, which is a different board entirely, and nothing
            about somebody's own pictures can be forked into a list. */}
        {post.category !== "custom" && post.isPublic && post.allowFork && (
          <Link
            href={`/u/${post.username}`}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:text-accent",
              !post.donationUrl && "ml-auto"
            )}
            title="Open the author’s list and fork it"
          >
            <GitFork className="h-3.5 w-3.5" aria-hidden />
            Fork
          </Link>
        )}
      </div>
    </article>
  );
}
