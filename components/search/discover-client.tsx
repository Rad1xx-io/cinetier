"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Loader2, Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CorrectedQueryHint } from "@/components/ui/corrected-query-hint";
import { ResultsGrid } from "@/components/search/results-grid";
import {
  DEFAULT_TITLE_FILTERS,
  TitleFilters,
  isDefaultTitleFilters,
  type TitleFilterState,
} from "@/components/search/title-filters";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { titleKey } from "@/lib/storage";
import { isTitleSort } from "@/lib/tmdb/title-filters";
import { FILTER_BAR_CLASS } from "@/lib/utils/filter-styles";
import type { ApiErrorBody, RankedTitle, SearchResponse, TitleSummary } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

type MediaFilter = "all" | "movie" | "tv";

const MEDIA_OPTIONS: { value: MediaFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "movie", label: "Фильмы" },
  { value: "tv", label: "Сериалы" },
];

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json();
  if (!res.ok) throw new Error((body as ApiErrorBody).error ?? "Что-то пошло не так.");
  return body as T;
}

export function DiscoverClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialType = searchParams.get("type");
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>(
    initialType === "movie" || initialType === "tv" ? initialType : "all"
  );
  const [filters, setFilters] = useState<TitleFilterState>(() => {
    const sortRaw = searchParams.get("sort") ?? "";
    const yearRaw = Number(searchParams.get("year") ?? 0);
    const ratingRaw = Number(searchParams.get("minRating") ?? 0);
    return {
      genre: searchParams.get("genre") ?? "",
      year: yearRaw > 1800 ? yearRaw : undefined,
      minRating: ratingRaw > 0 ? ratingRaw : 0,
      sort: isTitleSort(sortRaw) ? sortRaw : "popularity",
    };
  });

  const debouncedQuery = useDebouncedValue(query.trim(), 400);

  const [genres, setGenres] = useState<{ slug: string; label: string }[]>([]);
  const [results, setResults] = useState<TitleSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);

  const { titles, add } = useRankedTitles();
  const rankedByKey = useMemo(() => {
    const map = new Map<string, RankedTitle>();
    for (const t of titles) map.set(titleKey(t.tmdbId, t.mediaType), t);
    return map;
  }, [titles]);

  useEffect(() => {
    fetchJson<{ genres: { slug: string; label: string }[] }>("/api/tmdb/genres")
      .then((d) => setGenres(d.genres))
      .catch(() => setGenres([]));
  }, []);

  // Filters live in the url so a filtered view survives reload and can be shared.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (debouncedQuery) sp.set("q", debouncedQuery);
    if (mediaFilter !== "all") sp.set("type", mediaFilter);
    if (filters.genre) sp.set("genre", filters.genre);
    if (filters.year) sp.set("year", String(filters.year));
    if (filters.minRating) sp.set("minRating", String(filters.minRating));
    if (filters.sort !== "popularity") sp.set("sort", filters.sort);
    const qs = sp.toString();
    router.replace(qs ? `/discover?${qs}` : "/discover", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, mediaFilter, filters]);

  const isSearching = debouncedQuery.length > 0;

  const buildUrl = useCallback(
    (nextPage: number) => {
      if (isSearching) {
        const sp = new URLSearchParams({
          query: debouncedQuery,
          type: mediaFilter,
          page: String(nextPage),
        });
        return `/api/tmdb/search?${sp}`;
      }
      const sp = new URLSearchParams({ type: mediaFilter, page: String(nextPage) });
      if (filters.genre) sp.set("genre", filters.genre);
      if (filters.year) sp.set("year", String(filters.year));
      if (filters.minRating) sp.set("minRating", String(filters.minRating));
      sp.set("sort", filters.sort);
      return `/api/tmdb/discover?${sp}`;
    },
    [isSearching, debouncedQuery, mediaFilter, filters]
  );

  const requestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchJson<SearchResponse>(buildUrl(1), controller.signal);
        if (requestIdRef.current !== requestId) return;
        setResults(data.results);
        setCorrectedQuery(data.correctedQuery ?? null);
        setTotalPages(data.totalPages);
        setPage(1);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Не удалось загрузить тайтлы. Попробуйте ещё раз.");
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
      const next = page + 1;
      const data = await fetchJson<SearchResponse>(buildUrl(next));
      setResults((prev) => {
        const seen = new Set(prev.map((t) => titleKey(t.tmdbId, t.mediaType)));
        const merged = [...prev];
        for (const t of data.results) {
          const key = titleKey(t.tmdbId, t.mediaType);
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(t);
          }
        }
        return merged;
      });
      setPage(next);
    } catch (err) {
      setError((err as Error).message || "Не удалось загрузить тайтлы. Попробуйте ещё раз.");
    } finally {
      setLoadingMore(false);
    }
  }, [page, buildUrl]);

  function handleAdd(title: TitleSummary) {
    add({
      tmdbId: title.tmdbId,
      mediaType: title.mediaType,
      title: title.title,
      posterPath: title.posterPath,
      releaseDate: title.releaseDate,
      voteAverage: title.voteAverage,
    });
  }

  const canReset = !isDefaultTitleFilters(filters);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Фильмы и сериалы</h1>
          <p className="mt-1 text-sm text-muted">
            Ищите фильмы и сериалы в TMDB и добавляйте их в свой список.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/tier-list">
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Тир-лист
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск фильмов и сериалов…"
          className="pl-9"
          aria-label="Поиск в TMDB"
        />
      </div>

      <div className={FILTER_BAR_CLASS}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Тип">
            {MEDIA_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMediaFilter(opt.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mediaFilter === opt.value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted hover:text-foreground"
                )}
                aria-pressed={mediaFilter === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <TitleFilters
            value={filters}
            onChange={setFilters}
            genres={genres}
            canReset={canReset}
            onReset={() => setFilters(DEFAULT_TITLE_FILTERS)}
          />
        </div>

        {isSearching && canReset && (
          <p className="mt-2 text-xs text-muted">
            Пока идёт поиск по названию, фильтры не применяются — очистите строку поиска.
          </p>
        )}
      </div>

      <CorrectedQueryHint correctedQuery={correctedQuery} />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-tier-s/30 bg-tier-s/10 px-4 py-3 text-sm text-tier-s">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-muted">Загрузка…</p>}

      {!loading && !error && (
        <p className="text-sm text-muted">
          {results.length === 0 ? "Ничего не найдено." : `Найдено: ${results.length}`}
        </p>
      )}

      <ResultsGrid
        titles={results}
        rankedByKey={rankedByKey}
        onAdd={handleAdd}
        loading={loading && results.length === 0}
      />

      {!loading && !error && page < totalPages && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Показать ещё
          </Button>
        </div>
      )}
    </div>
  );
}
