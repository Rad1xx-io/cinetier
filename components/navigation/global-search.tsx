"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { titleHref } from "@/lib/utils/title-route";
import { posterUrl } from "@/lib/utils/tmdb-image";
import type { SearchResponse } from "@/lib/types";
import type { AnimeSearchResponse } from "@/lib/types/anime";
import type { GameSearchResponse } from "@/lib/types/game";
import type { ChannelSearchResponse } from "@/lib/types/youtube";

type Category = "movie" | "tv" | "anime" | "game" | "youtube";

interface QuickResult {
  key: string;
  href: string;
  title: string;
  subtitle: string;
  category: Category;
  thumbnail: string | null;
}

const CATEGORY_LABEL: Record<Category, string> = {
  movie: "FILM",
  tv: "TV",
  anime: "ANIME",
  game: "GAME",
  youtube: "YOUTUBE",
};

const RESULTS_PER_CATEGORY = 4;

async function safeFetch<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function runQuickSearch(query: string, signal: AbortSignal): Promise<QuickResult[]> {
  const q = encodeURIComponent(query);
  const [tmdb, anime, games, youtube] = await Promise.all([
    safeFetch<SearchResponse>(`/api/tmdb/search?query=${q}&type=all`, signal),
    safeFetch<AnimeSearchResponse>(`/api/anime/search?query=${q}&sort=popularity`, signal),
    safeFetch<GameSearchResponse>(`/api/games/search?query=${q}`, signal),
    safeFetch<ChannelSearchResponse>(`/api/youtube/search?query=${q}`, signal),
  ]);

  const results: QuickResult[] = [];

  for (const t of tmdb?.results.slice(0, RESULTS_PER_CATEGORY) ?? []) {
    results.push({
      key: `${t.mediaType}-${t.tmdbId}`,
      href: titleHref(t.mediaType, t.tmdbId),
      title: t.title,
      subtitle: t.releaseDate?.slice(0, 4) ?? "",
      category: t.mediaType,
      thumbnail: posterUrl(t.posterPath, "w185"),
    });
  }

  for (const a of anime?.results.slice(0, RESULTS_PER_CATEGORY) ?? []) {
    results.push({
      key: `anime-${a.anilistId}`,
      href: `/anime/${a.anilistId}`,
      title: a.title,
      subtitle: a.year ? String(a.year) : "",
      category: "anime",
      thumbnail: posterUrl(a.coverImage, "w185"),
    });
  }

  for (const g of games?.results.slice(0, RESULTS_PER_CATEGORY) ?? []) {
    results.push({
      key: `game-${g.appId}`,
      href: `/games/${g.appId}`,
      title: g.title,
      subtitle: g.releaseDate?.slice(0, 4) ?? "",
      category: "game",
      thumbnail: g.posterPath,
    });
  }

  for (const c of youtube?.results.slice(0, RESULTS_PER_CATEGORY) ?? []) {
    results.push({
      key: `youtube-${c.channelId}`,
      href: `/youtube/channel/${c.channelId}`,
      title: c.title,
      subtitle: c.handle ?? "",
      category: "youtube",
      thumbnail: c.thumbnailUrl,
    });
  }

  return results;
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebouncedValue(query.trim(), 350);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!debouncedQuery) return;
    const controller = new AbortController();

    async function run() {
      setLoading(true);
      const r = await runQuickSearch(debouncedQuery, controller.signal);
      if (!controller.signal.aborted) {
        setResults(r);
        setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [debouncedQuery]);

  const visibleResults = debouncedQuery ? results : [];
  const isLoading = debouncedQuery ? loading : false;

  function handleSelect(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Search TierListOnline"
        aria-haspopup="true"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
      >
        <Search className="h-4.5 w-4.5" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-96 max-w-[92vw] rounded-xl border border-border bg-surface-raised p-3 shadow-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search films, anime, YouTube…"
              className="pl-9 pr-8"
              aria-label="Search TierListOnline"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-foreground"
                aria-label="Clear"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>

          <div className="mt-2 max-h-96 overflow-y-auto">
            {isLoading && (
              <p className="flex items-center gap-2 px-2 py-6 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Searching…
              </p>
            )}

            {!isLoading && debouncedQuery && visibleResults.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted">Nothing found.</p>
            )}

            {!isLoading &&
              visibleResults.map((r) => (
                <Link
                  key={r.key}
                  href={r.href}
                  onClick={() => handleSelect(r.href)}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface"
                >
                  <span className="relative h-10 w-8 shrink-0 overflow-hidden rounded bg-surface">
                    {r.thumbnail && (
                      <Image src={r.thumbnail} alt="" fill sizes="32px" className="object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.title}</span>
                    {r.subtitle && <span className="block truncate text-xs text-muted">{r.subtitle}</span>}
                  </span>
                  <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[9px]">
                    {CATEGORY_LABEL[r.category]}
                  </Badge>
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
