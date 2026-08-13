"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Loader2, Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CorrectedQueryHint } from "@/components/ui/corrected-query-hint";
import { AnimeResultsGrid } from "@/components/anime-search/anime-results-grid";
import {
  AnimeFilters,
  DEFAULT_ANIME_FILTERS,
  isDefaultAnimeFilters,
  type AnimeFilterState,
} from "@/components/anime-search/anime-filters";
import { FILTER_BAR_CLASS } from "@/lib/utils/filter-styles";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { titleKey } from "@/lib/storage";
import { isAnimeFormat, type AnimeSortMode } from "@/lib/anilist/anime-filters";
import type { AnimeSearchResponse, AnimeSeason, AnimeStatus, AnimeSummary } from "@/lib/types/anime";
import type { ApiErrorBody, RankedTitle } from "@/lib/types";

const VALID_SORTS: AnimeSortMode[] = ["popularity", "score", "favourites", "release_date", "title"];
const VALID_SEASONS: AnimeSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
const VALID_STATUSES: AnimeStatus[] = ["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"];

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json();
  if (!res.ok) throw new Error((body as ApiErrorBody).error ?? "Что-то пошло не так.");
  return body as T;
}

function buildUrl(query: string, f: AnimeFilterState, page: number): string {
  const sp = new URLSearchParams();
  if (query) sp.set("query", query);
  if (f.genre) sp.set("genre", f.genre);
  if (f.year) sp.set("year", String(f.year));
  if (f.season) sp.set("season", f.season);
  if (f.format) sp.set("format", f.format);
  if (f.status) sp.set("status", f.status);
  sp.set("sort", f.sort);
  sp.set("page", String(page));
  return `/api/anime/search?${sp.toString()}`;
}

export function AnimeDiscoverClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<AnimeFilterState>(() => {
    const yearRaw = Number(searchParams.get("year") ?? 0);
    const seasonRaw = searchParams.get("season");
    const statusRaw = searchParams.get("status");
    const formatRaw = searchParams.get("format") ?? "";
    const sortRaw = searchParams.get("sort");
    return {
      genre: searchParams.get("genre") ?? "",
      year: yearRaw > 0 ? yearRaw : undefined,
      season: VALID_SEASONS.includes(seasonRaw as AnimeSeason) ? (seasonRaw as AnimeSeason) : undefined,
      format: isAnimeFormat(formatRaw) ? formatRaw : undefined,
      status: VALID_STATUSES.includes(statusRaw as AnimeStatus) ? (statusRaw as AnimeStatus) : undefined,
      sort: VALID_SORTS.includes(sortRaw as AnimeSortMode) ? (sortRaw as AnimeSortMode) : "popularity",
    };
  });

  const debouncedQuery = useDebouncedValue(query.trim(), 400);

  const [genres, setGenres] = useState<string[]>([]);
  const [results, setResults] = useState<AnimeSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
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
    fetchJson<{ genres: string[] }>("/api/anime/genres")
      .then((data) => setGenres(data.genres))
      .catch(() => setGenres([]));
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (debouncedQuery) sp.set("q", debouncedQuery);
    if (filters.genre) sp.set("genre", filters.genre);
    if (filters.year) sp.set("year", String(filters.year));
    if (filters.season) sp.set("season", filters.season);
    if (filters.format) sp.set("format", filters.format);
    if (filters.status) sp.set("status", filters.status);
    if (filters.sort !== "popularity") sp.set("sort", filters.sort);
    const qs = sp.toString();
    router.replace(qs ? `/anime?${qs}` : "/anime", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, filters]);

  const requestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchJson<AnimeSearchResponse>(
          buildUrl(debouncedQuery, filters, 1),
          controller.signal
        );
        if (requestIdRef.current !== requestId) return;
        setResults(data.results);
        setCorrectedQuery(data.correctedQuery ?? null);
        setHasNextPage(data.hasNextPage);
        setPage(1);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Не удалось загрузить аниме. Попробуйте ещё раз.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [debouncedQuery, filters]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await fetchJson<AnimeSearchResponse>(buildUrl(debouncedQuery, filters, nextPage));
      setResults((prev) => {
        const seen = new Set(prev.map((a) => a.anilistId));
        const merged = [...prev];
        for (const a of data.results) {
          if (!seen.has(a.anilistId)) {
            seen.add(a.anilistId);
            merged.push(a);
          }
        }
        return merged;
      });
      setHasNextPage(data.hasNextPage);
      setPage(nextPage);
    } catch (err) {
      setError((err as Error).message || "Не удалось загрузить аниме. Попробуйте ещё раз.");
    } finally {
      setLoadingMore(false);
    }
  }, [page, debouncedQuery, filters]);

  function handleAdd(anime: AnimeSummary) {
    add({
      tmdbId: anime.anilistId,
      mediaType: "anime",
      title: anime.title,
      posterPath: anime.coverImage,
      releaseDate: anime.year ? `${anime.year}-01-01` : null,
      voteAverage: anime.score ?? undefined,
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Аниме</h1>
          <p className="mt-1 text-sm text-muted">Ищите аниме и добавляйте их в свой список.</p>
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
          placeholder="Поиск аниме по названию…"
          className="pl-9"
          aria-label="Поиск аниме"
        />
      </div>

      <div className={FILTER_BAR_CLASS}>
        <AnimeFilters
          value={filters}
          onChange={setFilters}
          genres={genres}
          canReset={!isDefaultAnimeFilters(filters)}
          onReset={() => setFilters(DEFAULT_ANIME_FILTERS)}
        />
      </div>

      <CorrectedQueryHint correctedQuery={correctedQuery} />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-tier-s/30 bg-tier-s/10 px-4 py-3 text-sm text-tier-s">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-muted">Загрузка аниме…</p>}

      {!loading && !error && (
        <p className="text-sm text-muted">
          {results.length === 0
            ? "Аниме не найдено."
            : `Результаты: ${results.length}${hasNextPage ? "+" : ""}`}
        </p>
      )}

      <AnimeResultsGrid
        results={results}
        rankedByKey={rankedByKey}
        onAdd={handleAdd}
        loading={loading && results.length === 0}
      />

      {!loading && !error && hasNextPage && (
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
