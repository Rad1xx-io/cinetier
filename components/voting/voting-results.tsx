"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPost, getPostSnapshots, type FeedPost } from "@/lib/supabase/feed";
import { TIER_ORDER, type TierOrUnrated } from "@/lib/types";
import { TIER_META } from "@/lib/tier-meta";
import { tierColorVar } from "@/lib/utils/tier-style";
import { Poster } from "@/components/movie-card/poster";

interface VotingResultsProps {
  postId: string;
}

type ResultItem = { title: string; posterPath: string | null };
type ByTier = Record<TierOrUnrated, ResultItem[]>;

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; post: FeedPost; byTier: ByTier };

/**
 * What closing a session produced — an ordinary post, shown here directly
 * rather than through the full feed's PostDialog (no likes/comments panel
 * wired up, on purpose: this is the moment right after a room closes, not
 * the feed). The same post is also reachable normally afterward, through the
 * creator's own profile — the link at the bottom, not a second copy of it.
 */
export function VotingResults({ postId }: VotingResultsProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPost(postId), getPostSnapshots([postId])]).then(([post, snapshots]) => {
      if (cancelled) return;
      if (!post) {
        setState({ status: "missing" });
        return;
      }
      const snapshot = snapshots.get(postId);
      const byTier = Object.fromEntries(TIER_ORDER.map((t) => [t, [] as ResultItem[]])) as ByTier;
      for (const entry of snapshot?.titles ?? []) {
        byTier[entry.tier]?.push({ title: entry.title ?? "", posterPath: entry.posterPath ?? null });
      }
      setState({ status: "ready", post, byTier });
    });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  if (state.status === "loading") {
    return <p className="text-sm text-muted">Loading the result…</p>;
  }
  if (state.status === "missing") {
    return <p className="text-sm text-muted">The result could not be loaded.</p>;
  }

  const { post, byTier } = state;

  return (
    <div>
      <h2 className="text-lg font-semibold">{post.title}</h2>
      {post.description && <p className="mt-1 text-sm text-muted">{post.description}</p>}

      <div className="mt-4 space-y-2">
        {TIER_ORDER.filter((t) => t !== "Unrated" && byTier[t].length > 0).map((tier) => (
          <div key={tier} className="flex gap-2 rounded-lg border border-border">
            <div
              className="flex w-12 shrink-0 flex-col items-center justify-center rounded-l-lg py-2 text-sm font-bold text-background"
              style={{ backgroundColor: tierColorVar(tier) }}
              title={TIER_META[tier].name}
            >
              {tier}
            </div>
            <div className="flex flex-1 flex-wrap gap-2 p-2">
              {byTier[tier].map((item, i) => (
                <div key={i} className="w-16">
                  <Poster
                    posterPath={item.posterPath}
                    title={item.title}
                    className="w-16"
                    sizes="64px"
                  />
                  <p className="mt-1 truncate text-[11px]">{item.title}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {byTier.Unrated.length > 0 && (
          <p className="text-xs text-muted">
            {byTier.Unrated.length} item{byTier.Unrated.length === 1 ? "" : "s"} got no votes at all and
            stayed unrated.
          </p>
        )}
      </div>

      <Link href={`/u/${post.username}`} className="mt-4 inline-block text-sm text-accent hover:underline">
        View in {post.displayName ?? post.username}&apos;s posts
      </Link>
    </div>
  );
}
