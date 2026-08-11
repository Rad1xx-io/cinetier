"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ResultsGrid } from "@/components/search/results-grid";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { titleKey } from "@/lib/storage";
import type { ApiErrorBody, RankedTitle, SearchResponse, TitleSummary } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

type MediaFilter = "all" | "movie" | "tv";

const MEDIA_OPTIONS: { value: MediaFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "movie", label: "Фильмы" },
  { value: "tv", label: "Сериалы" },
];

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json();
  if (!res.ok) throw new Error((body as ApiErrorBody).error ?? "Что-то пошло не так.");
  return body as T;
}

export function DiscoverClient() {
  const searchParams = useSearchParams();
  const initialType = (searchParams.get("type") as MediaFilter) ?? "all";

  const [query, setQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>(
    initialType === "movie" || initialType === "tv" ? initialType : "all"
  );
  const debouncedQuery = useDebouncedValue(query.trim(), 400);

  const [results, setResults] = useState<TitleSummary[]>([]);
  const [popularMovies, setPopularMovies] = useState<TitleSummary[]>([]);
  const [popularTV, setPopularTV] = useState<TitleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { titles, add } = useRankedTitles();
  const rankedByKey = useMemo(() => {
    const map = new Map<string, RankedTitle>();
    for (const t of titles) map.set(titleKey(t.tmdbId, t.mediaType), t);
    return map;
  }, [titles]);

  const isSearching = debouncedQuery.length > 0;

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      setLoading(true);
      setError(null);
      try {
        if (isSearching) {
          const data = await fetchJson<SearchResponse>(
            `/api/tmdb/search?query=${encodeURIComponent(debouncedQuery)}&type=${mediaFilter}`,
            controller.signal
          );
          setResults(data.results);
        } else {
          const [movies, tv] = await Promise.all([
            fetchJson<SearchResponse>("/api/tmdb/popular?type=movie", controller.signal),
            fetchJson<SearchResponse>("/api/tmdb/popular?type=tv", controller.signal),
          ]);
          setPopularMovies(movies.results);
          setPopularTV(tv.results);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Не удалось загрузить тайтлы. Попробуйте ещё раз.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [debouncedQuery, mediaFilter, isSearching]);

  function handleAdd(title: TitleSummary) {
    add({
      tmdbId: title.tmdbId,
      mediaType: title.mediaType,
      title: title.title,
      posterPath: title.posterPath,
      releaseDate: title.releaseDate,
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Поиск</h1>
        <p className="mt-1 text-sm text-muted">
          Ищите фильмы и сериалы в TMDB и добавляйте их в свой список.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск фильмов и сериалов…"
            className="pl-9"
            aria-label="Поиск в TMDB"
          />
        </div>
        <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Фильтр по типу">
          {MEDIA_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMediaFilter(opt.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                mediaFilter === opt.value ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
              )}
              aria-pressed={mediaFilter === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-tier-s/30 bg-tier-s/10 px-4 py-3 text-sm text-tier-s">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {!error && isSearching && (
        <ResultsGrid titles={results} rankedByKey={rankedByKey} onAdd={handleAdd} loading={loading} />
      )}

      {!error && !isSearching && (
        <div className="space-y-8">
          {mediaFilter !== "tv" && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Популярные фильмы</h2>
              <ResultsGrid titles={popularMovies} rankedByKey={rankedByKey} onAdd={handleAdd} loading={loading} />
            </section>
          )}
          {mediaFilter !== "movie" && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Популярные сериалы</h2>
              <ResultsGrid titles={popularTV} rankedByKey={rankedByKey} onAdd={handleAdd} loading={loading} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
