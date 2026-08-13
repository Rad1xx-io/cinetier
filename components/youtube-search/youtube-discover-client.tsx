"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Loader2, Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChannelResultsGrid } from "@/components/youtube-search/channel-results-grid";
import {
  ChannelFilters,
  DEFAULT_CHANNEL_FILTERS,
  isDefaultChannelFilters,
  type ChannelFilterState,
} from "@/components/youtube-search/channel-filters";
import { FILTER_BAR_CLASS } from "@/lib/utils/filter-styles";
import { useRankedChannels } from "@/lib/hooks/use-ranked-channels";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import type { ChannelSortMode } from "@/lib/youtube/channel-lookup";
import type { ApiErrorBody, ChannelSearchResponse, ChannelSummary, RankedChannel } from "@/lib/types/youtube";

const PAGE_SIZE = 24;
const VALID_SORTS: ChannelSortMode[] = [
  "subscribers_desc",
  "subscribers_asc",
  "views_desc",
  "views_asc",
  "newest",
  "title",
];

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json();
  if (!res.ok) throw new Error((body as ApiErrorBody).error ?? "Что-то пошло не так.");
  return body as T;
}

function buildSearchUrl(query: string, f: ChannelFilterState, pageToken?: string): string {
  const sp = new URLSearchParams();
  if (query) sp.set("query", query);
  if (f.country) sp.set("country", f.country);
  if (f.minSubscribers > 0) sp.set("minSubscribers", String(f.minSubscribers));
  sp.set("sort", f.sort);
  if (pageToken) sp.set("pageToken", pageToken);
  return `/api/youtube/search?${sp.toString()}`;
}

export function YouTubeDiscoverClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<ChannelFilterState>(() => {
    const subsRaw = Number(searchParams.get("minSubscribers") ?? 0);
    const sortRaw = searchParams.get("sort");
    return {
      country: searchParams.get("country") ?? "",
      minSubscribers: Number.isFinite(subsRaw) ? subsRaw : 0,
      sort: VALID_SORTS.includes(sortRaw as ChannelSortMode)
        ? (sortRaw as ChannelSortMode)
        : "subscribers_desc",
    };
  });
  const debouncedQuery = useDebouncedValue(query.trim(), 400);

  const [results, setResults] = useState<ChannelSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { channels, add } = useRankedChannels();
  const rankedByKey = useMemo(() => {
    const map = new Map<string, RankedChannel>();
    for (const c of channels) map.set(c.channelId, c);
    return map;
  }, [channels]);

  // Keep the URL in sync so filters survive a reload, are shareable, and work with Back/Forward.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (debouncedQuery) sp.set("q", debouncedQuery);
    if (filters.country) sp.set("country", filters.country);
    if (filters.minSubscribers > 0) sp.set("minSubscribers", String(filters.minSubscribers));
    if (filters.sort !== "subscribers_desc") sp.set("sort", filters.sort);
    const qs = sp.toString();
    router.replace(qs ? `/youtube?${qs}` : "/youtube", { scroll: false });
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
        const data = await fetchJson<ChannelSearchResponse>(
          buildSearchUrl(debouncedQuery, filters),
          controller.signal
        );
        if (requestIdRef.current !== requestId) return;
        setResults(data.results);
        setNextPageToken(data.nextPageToken);
        setVisibleCount(PAGE_SIZE);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Не удалось загрузить каналы. Попробуйте ещё раз.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [debouncedQuery, filters]);

  const hasMoreLocal = visibleCount < results.length;
  const canLoadMore = hasMoreLocal || Boolean(nextPageToken);

  const handleLoadMore = useCallback(async () => {
    if (hasMoreLocal) {
      setVisibleCount((v) => Math.min(v + PAGE_SIZE, results.length));
      return;
    }
    if (!nextPageToken) return;

    setLoadingMore(true);
    try {
      const data = await fetchJson<ChannelSearchResponse>(
        buildSearchUrl(debouncedQuery, filters, nextPageToken),
        new AbortController().signal
      );
      setResults((prev) => {
        const seen = new Set(prev.map((c) => c.channelId));
        const merged = [...prev];
        for (const c of data.results) {
          if (!seen.has(c.channelId)) {
            seen.add(c.channelId);
            merged.push(c);
          }
        }
        return merged;
      });
      setNextPageToken(data.nextPageToken);
      setVisibleCount((v) => v + PAGE_SIZE);
    } catch (err) {
      setError((err as Error).message || "Не удалось загрузить каналы. Попробуйте ещё раз.");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMoreLocal, results.length, nextPageToken, debouncedQuery, filters]);

  function handleAdd(channel: ChannelSummary) {
    add({
      channelId: channel.channelId,
      title: channel.title,
      thumbnailUrl: channel.thumbnailUrl,
      country: channel.country,
      subscriberCount: channel.subscriberCount ?? undefined,
    });
  }

  const visibleResults = results.slice(0, visibleCount);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">YouTube-каналы</h1>
          <p className="mt-1 text-sm text-muted">Ищите каналы и добавляйте их в свой список.</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/youtube/tier-list">
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Тир-лист каналов
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск YouTube-каналов по названию…"
          className="pl-9"
          aria-label="Поиск каналов"
        />
      </div>

      <div className={FILTER_BAR_CLASS}>
        <ChannelFilters
          value={filters}
          onChange={setFilters}
          canReset={!isDefaultChannelFilters(filters)}
          onReset={() => setFilters(DEFAULT_CHANNEL_FILTERS)}
        />
      </div>

      {filters.country && (
        <p className="text-xs text-muted">
          Страну канала указывает сам автор — часть каналов её не заполняют и не попадут в этот
          фильтр, даже если контент им подходит.
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-tier-s/30 bg-tier-s/10 px-4 py-3 text-sm text-tier-s">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {!error && !loading && (
        <p className="text-sm text-muted">
          {results.length === 0
            ? "Каналы не найдены."
            : `Показано ${Math.min(visibleCount, results.length)} из ${results.length} каналов`}
        </p>
      )}

      {!error && (
        <ChannelResultsGrid channels={visibleResults} rankedByKey={rankedByKey} onAdd={handleAdd} loading={loading} />
      )}

      {!error && !loading && canLoadMore && (
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
