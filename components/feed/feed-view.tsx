"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessagesSquare, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "@/components/feed/post-card";
import { getPublishedBoards, type PublishedBoard } from "@/lib/supabase/custom-lists";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PostDialog } from "@/components/feed/post-dialog";
import {
  getAuthorTitles,
  getFeed,
  getMyLikes,
  getPostSnapshots,
  toggleLike,
  type FeedPost,
  type PostCategory,
  type RankedTitleSnapshotEntry,
} from "@/lib/supabase/feed";
import { resolveSnapshotTitles, titlesByAuthor } from "@/lib/feed/post-preview";
import {
  trackCommunityPostViewed,
  trackPageView,
  trackPostCommented,
  trackPostLiked,
} from "@/lib/analytics/events";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import type { RankedTitle } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

const CATEGORY_TABS: { value: PostCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Films" },
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
  { value: "game", label: "Games" },
  { value: "youtube", label: "YouTube" },
  { value: "mixed", label: "Mixed" },
  // A showcase, not a moderation boundary: reporting a custom photo is still
  // a manual console.error today (see .ai/ARCHITECTURE.md), unchanged by
  // giving these posts a tab of their own to be found in.
  { value: "custom", label: "Custom" },
];

type LoadState = "loading" | "ready" | "unavailable";

export function FeedView() {
  const [state, setState] = useState<LoadState>("loading");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [authorTitles, setAuthorTitles] = useState<Map<string, RankedTitle[]>>(new Map());
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [published, setPublished] = useState<Map<string, PublishedBoard>>(new Map());
  const [snapshots, setSnapshots] = useState<Map<string, RankedTitleSnapshotEntry[]>>(new Map());
  const [category, setCategory] = useState<PostCategory | "all">("all");
  const [openPost, setOpenPost] = useState<FeedPost | null>(null);
  const { user } = useSupabaseSession();

  // Switching tabs resets the list during render rather than in the effect: the
  // old category's cards must not sit under the new tab's heading for a frame.
  const [loadedCategory, setLoadedCategory] = useState<PostCategory | "all">(category);
  if (loadedCategory !== category) {
    setLoadedCategory(category);
    setState("loading");
    setPosts([]);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const rows = await getFeed(category === "all" ? {} : { category });
      if (cancelled) return;

      setPosts(rows);
      setState("ready");

      if (rows.length === 0) {
        setAuthorTitles(new Map());
        setLikes(new Set());
        setPublished(new Map());
        setSnapshots(new Map());
        return;
      }

      // Both follow-ups are for decoration on cards already on screen, so they
      // are not awaited together with the feed itself.
      const authorIds = [...new Set(rows.map((post) => post.userId))];
      /*
       * Boards of uploaded pictures come from their own snapshot rather than
       * from the author's ranked titles, and their covers are signed there and
       * then — which is what lets a card taken down since publication fall out
       * of a post that was frozen weeks ago.
       */
      const supabase = getSupabaseBrowserClient();
      const customPostIds = rows.filter((post) => post.category === "custom").map((post) => post.id);
      // The other kind of post gets the same treatment: a snapshot to resolve
      // against, rather than a fresh read of the author's live board.
      const ordinaryPostIds = rows.filter((post) => post.category !== "custom").map((post) => post.id);
      const [titles, myLikes, boards, postSnapshots] = await Promise.all([
        getAuthorTitles(authorIds),
        getMyLikes(rows.map((post) => post.id)),
        supabase && customPostIds.length > 0
          ? getPublishedBoards(supabase, customPostIds)
          : Promise.resolve(new Map<string, PublishedBoard>()),
        getPostSnapshots(ordinaryPostIds),
      ]);
      if (cancelled) return;
      setAuthorTitles(titlesByAuthor(titles));
      setLikes(myLikes);
      setPublished(boards);
      setSnapshots(postSnapshots);
    })().catch(() => {
      if (!cancelled) setState("unavailable");
    });

    return () => {
      cancelled = true;
    };
  }, [category]);

  const handleToggleLike = useCallback(async (post: FeedPost) => {
    const wasLiked = likes.has(post.id);

    // Optimistic: a like should feel instant, and the rollback below covers the
    // case where the write is refused (signed out, offline).
    setLikes((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, likesCount: p.likesCount + (wasLiked ? -1 : 1) } : p
      )
    );

    const result = await toggleLike(post.id, wasLiked);
    // Reported only once the write lands: an optimistic flip that rolls back is
    // not a like, and counting it would inflate the number the funnel exists to
    // measure.
    if (result !== null) trackPostLiked(post.id, result);

    if (result === null) {
      setLikes((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, likesCount: p.likesCount + (wasLiked ? 1 : -1) } : p
        )
      );
    }
  }, [likes]);

  /*
   * Opening someone else's post is the read half of the feed, and the only
   * half that leaves no other trace — a post nobody opens looks identical to a
   * post nobody scrolled past. Own posts are skipped: an author checking their
   * own work is not community engagement.
   */
  const handleOpenPost = useCallback(
    (post: FeedPost) => {
      setOpenPost(post);
      if (post.userId !== user?.id) {
        trackCommunityPostViewed(post.id, post.category, post.userId);
      }
    },
    [user]
  );

  /** Drops a post the author has just removed, without refetching the feed. */
  const handlePostDeleted = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setPublished((prev) => {
      if (!prev.has(postId)) return prev;
      const next = new Map(prev);
      next.delete(postId);
      return next;
    });
  }, []);

  /**
   * What a post actually shows: the frozen shape if it has one, resolved
   * against the author's live board for the catalogue facts; the whole live
   * board if it does not — a post published before snapshots existed.
   */
  const titlesForPost = useCallback(
    (post: FeedPost) =>
      resolveSnapshotTitles(snapshots.get(post.id), authorTitles.get(post.userId) ?? []),
    [snapshots, authorTitles]
  );

  const handleCommentAdded = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p))
    );
    trackPostCommented(postId);
  }, []);

  useEffect(() => {
    trackPageView("/feed");
  }, []);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Community</h1>
        <p className="mt-1 text-sm text-muted">
          Other people’s tier lists, arguments in the comments, and taste you can take for yourself.
        </p>
      </header>

      <div
        className="mb-5 flex flex-wrap gap-1 rounded-lg border border-border p-0.5"
        role="group"
        aria-label="Post category"
      >
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setCategory(tab.value)}
            aria-pressed={category === tab.value}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              category === tab.value
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {state === "unavailable" && (
        <div className="flex items-center gap-2 rounded-lg border border-tier-s/30 bg-tier-s/10 px-4 py-3 text-sm text-tier-s">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          The feed is unavailable right now. Try reloading the page.
        </div>
      )}

      {state === "loading" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      )}

      {state === "ready" && posts.length === 0 && (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <MessagesSquare className="h-10 w-10 text-accent" aria-hidden />
          <h2 className="text-lg font-semibold">Nothing here yet</h2>
          <p className="text-sm text-muted">
            Be the first to publish — the “Publish” button lives on your tier list page.
          </p>
          <Button asChild size="sm">
            <Link href="/tier-list">Go to my tier list</Link>
          </Button>
        </div>
      )}

      {state === "ready" && posts.length > 0 && (
        // One column on a phone, two on a tablet, three on a desktop.
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              titles={titlesForPost(post)}
              published={published.get(post.id)}
              liked={likes.has(post.id)}
              onOpen={handleOpenPost}
              onToggleLike={handleToggleLike}
            />
          ))}
        </div>
      )}

      <PostDialog
        post={openPost}
        titles={openPost ? titlesForPost(openPost) : []}
        snapshot={openPost ? snapshots.get(openPost.id) : undefined}
        published={openPost ? published.get(openPost.id) : undefined}
        onDeleted={handlePostDeleted}
        onClose={() => setOpenPost(null)}
        liked={openPost ? likes.has(openPost.id) : false}
        onToggleLike={handleToggleLike}
        onCommentAdded={handleCommentAdded}
      />
    </div>
  );
}
