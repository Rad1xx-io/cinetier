"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Loader2, Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trackItemAdded } from "@/lib/analytics/events";
import { CorrectedQueryHint } from "@/components/ui/corrected-query-hint";
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
  if (!res.ok) throw new Error((body as ApiErrorBody).error ?? "Something went wrong.");
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

interface YouTubeDiscoverClientProps {
  /**
   * The default listing, rendered on the server so the HTML is not empty.
   * Null when the YouTube API could not be reached at render time — the client
   * then fetches exactly as it did before.
   */
  initialData?: ChannelSearchResponse | null;
}

export function YouTubeDiscoverClient({ initialData }: YouTubeDiscoverClientProps = {}) {
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

  /**
   * The server rendered the default listing, so it only applies while the
   * visitor is still looking at the default listing.
   */
  const arrivedFiltered = ["q", "country", "minSubscribers", "sort"].some((key) =>
    searchParams.get(key)
  );
  const serverData = arrivedFiltered ? null : (initialData ?? null);
  const pendingServerData = useRef(serverData);

  const [results, setResults] = useState<ChannelSummary[]>(serverData?.results ?? []);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(serverData?.nextPageToken);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Starting true with server data on screen would swap it for a skeleton on
  // the first paint, undoing the point of rendering it.
  const [loading, setLoading] = useState(!serverData);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);

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
    // The first pass has its answer already. Consumed once, so any later change
    // of query or filter fetches normally.
    if (pendingServerData.current) {
      pendingServerData.current = null;
      return;
    }

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
        setCorrectedQuery(data.correctedQuery ?? null);
        setNextPageToken(data.nextPageToken);
        setVisibleCount(PAGE_SIZE);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Could not load channels. Please try again.");
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
      setError((err as Error).message || "Could not load channels. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMoreLocal, results.length, nextPageToken, debouncedQuery, filters]);

  function handleAdd(channel: ChannelSummary) {
    trackItemAdded(`youtube-${channel.channelId}`, "youtube", debouncedQuery ? "search" : "discover");
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
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">YouTube channels</h1>
          <p className="mt-1 text-sm text-muted">Search for channels and add them to your list.</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/youtube/tier-list">
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Channel tier list
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search YouTube channels by name…"
          className="pl-9"
          aria-label="Search channels"
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
          A channel’s country is set by its owner — some leave it blank and will not appear in this
          filter even when their content fits.
        </p>
      )}

      <CorrectedQueryHint correctedQuery={correctedQuery} />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-tier-s/30 bg-tier-s/10 px-4 py-3 text-sm text-tier-s">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {!error && !loading && (
        <p className="text-sm text-muted">
          {results.length === 0
            ? "No channels found."
            : `Showing ${Math.min(visibleCount, results.length)} of ${results.length} channels`}
        </p>
      )}

      {!error && (
        <ChannelResultsGrid channels={visibleResults} rankedByKey={rankedByKey} onAdd={handleAdd} loading={loading} />
      )}

      {!error && !loading && canLoadMore && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}
