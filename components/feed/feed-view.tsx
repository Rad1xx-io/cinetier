"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessagesSquare, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "@/components/feed/post-card";
import { PostDialog } from "@/components/feed/post-dialog";
import {
  getAuthorTitles,
  getFeed,
  getMyLikes,
  toggleLike,
  type FeedPost,
  type PostCategory,
} from "@/lib/supabase/feed";
import { titlesByAuthor } from "@/lib/feed/post-preview";
import { trackPageView, trackPostCommented, trackPostLiked } from "@/lib/analytics/events";
import type { RankedTitle } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

const CATEGORY_TABS: { value: PostCategory | "all"; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "movie", label: "Фильмы" },
  { value: "tv", label: "Сериалы" },
  { value: "anime", label: "Аниме" },
  { value: "game", label: "Игры" },
  { value: "youtube", label: "YouTube" },
  { value: "mixed", label: "Сборные" },
];

type LoadState = "loading" | "ready" | "unavailable";

export function FeedView() {
  const [state, setState] = useState<LoadState>("loading");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [authorTitles, setAuthorTitles] = useState<Map<string, RankedTitle[]>>(new Map());
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<PostCategory | "all">("all");
  const [openPost, setOpenPost] = useState<FeedPost | null>(null);

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
        return;
      }

      // Both follow-ups are for decoration on cards already on screen, so they
      // are not awaited together with the feed itself.
      const authorIds = [...new Set(rows.map((post) => post.userId))];
      const [titles, myLikes] = await Promise.all([
        getAuthorTitles(authorIds),
        getMyLikes(rows.map((post) => post.id)),
      ]);
      if (cancelled) return;
      setAuthorTitles(titlesByAuthor(titles));
      setLikes(myLikes);
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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Сообщество</h1>
        <p className="mt-1 text-sm text-muted">
          Чужие тир-листы, споры в комментариях и чужие вкусы, которые можно забрать себе.
        </p>
      </header>

      <div
        className="mb-5 flex flex-wrap gap-1 rounded-lg border border-border p-0.5"
        role="group"
        aria-label="Категория постов"
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
          Лента сейчас недоступна. Попробуйте обновить страницу.
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
          <h2 className="text-lg font-semibold">Здесь пока пусто</h2>
          <p className="text-sm text-muted">
            Опубликуйте свой тир-лист первым — кнопка «Опубликовать» на странице тир-листа.
          </p>
          <Button asChild size="sm">
            <Link href="/tier-list">К своему тир-листу</Link>
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
              titles={authorTitles.get(post.userId) ?? []}
              liked={likes.has(post.id)}
              onOpen={setOpenPost}
              onToggleLike={handleToggleLike}
            />
          ))}
        </div>
      )}

      <PostDialog
        post={openPost}
        titles={openPost ? (authorTitles.get(openPost.userId) ?? []) : []}
        onClose={() => setOpenPost(null)}
        liked={openPost ? likes.has(openPost.id) : false}
        onToggleLike={handleToggleLike}
        onCommentAdded={handleCommentAdded}
      />
    </div>
  );
}
