"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Loader2, Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trackItemAdded } from "@/lib/analytics/events";
import { MobileGamesResultsGrid } from "@/components/mobile-game-card/mobile-games-results-grid";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { titleKey } from "@/lib/storage";
import type { MobileGameSearchResponse, MobileGameSummary } from "@/lib/types/mobile-game";
import type { ApiErrorBody, RankedTitle } from "@/lib/types";

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json();
  if (!res.ok) throw new Error((body as ApiErrorBody).error ?? "Something went wrong.");
  return body as T;
}

/**
 * No default listing here, unlike /games/pc — see lib/app-store/discovery.ts's
 * own header for why: iTunes Search has no "browse everything" endpoint to
 * seed one from, so this page starts on a prompt rather than a fake "popular"
 * query standing in for one.
 */
export function MobileGamesDiscoverClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const debouncedQuery = useDebouncedValue(query.trim(), 400);

  const [results, setResults] = useState<MobileGameSummary[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived, not stored: a cleared search box hides whatever was last fetched
  // without an effect needing to reset it, and "have we searched at all" is
  // just "is there a query" — nothing to keep in sync by hand.
  const searched = Boolean(debouncedQuery);
  const visibleResults = searched ? results : [];
  const visibleHasMore = searched && hasMore;

  const { titles, add } = useRankedTitles();
  const rankedByKey = useMemo(() => {
    const map = new Map<string, RankedTitle>();
    for (const t of titles) map.set(titleKey(t.tmdbId, t.mediaType), t);
    return map;
  }, [titles]);

  useEffect(() => {
    router.replace(debouncedQuery ? `/games/mobile?q=${encodeURIComponent(debouncedQuery)}` : "/games/mobile", {
      scroll: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const requestIdRef = useRef(0);

  const buildUrl = useCallback(
    (pageIndex: number) => {
      const sp = new URLSearchParams({ query: debouncedQuery });
      if (pageIndex > 0) sp.set("page", String(pageIndex));
      return `/api/mobile-games/search?${sp.toString()}`;
    },
    [debouncedQuery]
  );

  useEffect(() => {
    if (!debouncedQuery) return;

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchJson<MobileGameSearchResponse>(buildUrl(0), controller.signal);
        if (requestIdRef.current !== requestId) return;
        setResults(data.results);
        setHasMore(data.hasMore);
        setPage(0);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Could not load mobile games. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [buildUrl, debouncedQuery]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await fetchJson<MobileGameSearchResponse>(buildUrl(nextPage), new AbortController().signal);
      setResults((prev) => {
        const seen = new Set(prev.map((g) => g.appId));
        const merged = [...prev];
        for (const game of data.results) {
          if (!seen.has(game.appId)) {
            seen.add(game.appId);
            merged.push(game);
          }
        }
        return merged;
      });
      setHasMore(data.hasMore);
      setPage(nextPage);
    } catch (err) {
      setError((err as Error).message || "Could not load mobile games. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [page, buildUrl]);

  function handleAdd(game: MobileGameSummary) {
    trackItemAdded(`mobile_game-${game.appId}`, "mobile_game", "search");
    add({
      tmdbId: game.appId,
      mediaType: "mobile_game",
      title: game.title,
      posterPath: game.posterPath,
      releaseDate: game.releaseDate,
      voteAverage: game.score ?? undefined,
      mobileGameSource: game.source,
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Mobile Games</h1>
          <p className="mt-1 text-sm text-muted">
            Search the App Store and add games to your list.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/tier-list">
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Tier list
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search mobile games by title…"
          className="pl-9"
          aria-label="Search mobile games"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-tier-s/30 bg-tier-s/10 px-4 py-3 text-sm text-tier-s">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            {error}
            {visibleResults.length > 0 && " The games below are the last ones loaded."}
          </span>
        </div>
      )}

      {loading && <p className="text-sm text-muted">Loading games…</p>}

      {!loading && !error && searched && (
        <p className="text-sm text-muted">
          {visibleResults.length === 0 ? "No games match this search." : `${visibleResults.length} found`}
        </p>
      )}

      <MobileGamesResultsGrid
        results={visibleResults}
        rankedByKey={rankedByKey}
        onAdd={handleAdd}
        loading={loading && visibleResults.length === 0}
        searched={searched}
      />

      {!loading && visibleHasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
