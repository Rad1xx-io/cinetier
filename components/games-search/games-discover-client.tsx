"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Loader2, Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trackItemAdded } from "@/lib/analytics/events";
import { CorrectedQueryHint } from "@/components/ui/corrected-query-hint";
import { GamesResultsGrid } from "@/components/games-search/games-results-grid";
import {
  DEFAULT_GAME_FILTERS,
  GameFilters,
  isDefaultGameFilters,
  type GameFilterState,
} from "@/components/games-search/game-filters";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { titleKey } from "@/lib/storage";
import {
  isGameCategory,
  isGameGenre,
  isGamePlatform,
  isGameSort,
} from "@/lib/steam/filters";
import type { GameSearchResponse, GameSummary } from "@/lib/types/game";
import type { ApiErrorBody, RankedTitle } from "@/lib/types";

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json();
  if (!res.ok) throw new Error((body as ApiErrorBody).error ?? "Что-то пошло не так.");
  return body as T;
}

export function GamesDiscoverClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<GameFilterState>(() => {
    const genre = searchParams.get("genre") ?? "";
    const platform = searchParams.get("platform") ?? "";
    const category = searchParams.get("category") ?? "";
    const sort = searchParams.get("sort") ?? "";
    return {
      genre: isGameGenre(genre) ? genre : "",
      platform: isGamePlatform(platform) ? platform : "",
      category: isGameCategory(category) ? category : "",
      sort: isGameSort(sort) ? sort : "popularity",
    };
  });

  // Only the text field needs debouncing — the selects fire once per choice,
  // but they share the debounced value so a filter change mid-typing still
  // collapses into a single request.
  const debouncedQuery = useDebouncedValue(query.trim(), 400);

  const [results, setResults] = useState<GameSummary[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const { titles, add } = useRankedTitles();
  const rankedByKey = useMemo(() => {
    const map = new Map<string, RankedTitle>();
    for (const t of titles) map.set(titleKey(t.tmdbId, t.mediaType), t);
    return map;
  }, [titles]);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (debouncedQuery) sp.set("q", debouncedQuery);
    if (filters.genre) sp.set("genre", filters.genre);
    if (filters.platform) sp.set("platform", filters.platform);
    if (filters.category) sp.set("category", filters.category);
    if (filters.sort !== "popularity") sp.set("sort", filters.sort);
    const qs = sp.toString();
    router.replace(qs ? `/games?${qs}` : "/games", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, filters]);

  const requestIdRef = useRef(0);

  const buildUrl = useCallback(
    (pageIndex: number) => {
      const sp = new URLSearchParams();
      if (debouncedQuery) sp.set("query", debouncedQuery);
      if (filters.genre) sp.set("genre", filters.genre);
      if (filters.platform) sp.set("platform", filters.platform);
      if (filters.category) sp.set("category", filters.category);
      sp.set("sort", filters.sort);
      if (pageIndex > 0) sp.set("page", String(pageIndex));
      return `/api/games/search?${sp.toString()}`;
    },
    [debouncedQuery, filters]
  );

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchJson<GameSearchResponse>(buildUrl(0), controller.signal);
        if (requestIdRef.current !== requestId) return;
        setResults(data.results);
        setCorrectedQuery(data.correctedQuery ?? null);
        setHasMore(data.hasMore);
        setStale(Boolean(data.stale));
        setPage(0);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // Deliberately keeps whatever is already on screen: a failed request
        // mid-typing should not wipe the results the user was looking at.
        setError((err as Error).message || "Не удалось загрузить игры. Попробуйте ещё раз.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [buildUrl]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await fetchJson<GameSearchResponse>(
        buildUrl(nextPage),
        new AbortController().signal
      );
      // Steam's pages can overlap once filters narrow the catalog, so merge by app id.
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
      setError((err as Error).message || "Не удалось загрузить игры. Попробуйте ещё раз.");
    } finally {
      setLoadingMore(false);
    }
  }, [page, buildUrl]);

  function handleAdd(game: GameSummary) {
    trackItemAdded(`game-${game.appId}`, "game", debouncedQuery ? "search" : "discover");
    add({
      tmdbId: game.appId,
      mediaType: "game",
      title: game.title,
      posterPath: game.posterPath,
      releaseDate: game.releaseDate,
      voteAverage: game.score ?? undefined,
    });
  }

  const filtersDirty = !isDefaultGameFilters(filters) || query !== "";

  function handleReset() {
    setQuery("");
    setFilters(DEFAULT_GAME_FILTERS);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Игры</h1>
          <p className="mt-1 text-sm text-muted">Ищите игры и добавляйте их в свой список.</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/tier-list">
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Тир-лист
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
          placeholder="Поиск игр по названию…"
          className="pl-9"
          aria-label="Поиск игр"
        />
      </div>

      <GameFilters
        value={filters}
        onChange={setFilters}
        canReset={filtersDirty}
        onReset={handleReset}
      />

      <CorrectedQueryHint correctedQuery={correctedQuery} />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-tier-s/30 bg-tier-s/10 px-4 py-3 text-sm text-tier-s">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            {error}
            {results.length > 0 && " Ниже — последние загруженные игры."}
          </span>
        </div>
      )}

      {!error && stale && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          Каталог сейчас недоступен — показаны сохранённые результаты.
        </div>
      )}

      {loading && <p className="text-sm text-muted">Загрузка игр…</p>}

      {!loading && !error && (
        <p className="text-sm text-muted">
          {results.length === 0
            ? "По этим фильтрам игры не найдены."
            : `Найдено: ${results.length}`}
        </p>
      )}

      {/* Rendered even while an error banner is up, so a failed keystroke keeps
          the previous results visible instead of blanking the page. */}
      <GamesResultsGrid
        results={results}
        rankedByKey={rankedByKey}
        onAdd={handleAdd}
        loading={loading && results.length === 0}
      />

      {!loading && hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Загрузить ещё
          </Button>
        </div>
      )}
    </div>
  );
}
