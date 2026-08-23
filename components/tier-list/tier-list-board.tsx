"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useRankedChannels } from "@/lib/hooks/use-ranked-channels";
import { useDensity } from "@/lib/hooks/use-density";
import { TIER_ORDER } from "@/lib/types";
import type { RankedTitle, TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import { type SortMode } from "@/lib/utils/tier-grouping";
import {
  boardItemKey,
  filterAndSortBoardItems,
  groupBoard,
  splitBoardItems,
  toBoardItems,
  type BoardBuckets,
  type BoardItem,
} from "@/lib/utils/board-item";
import { type CategoryFilter } from "@/lib/utils/content-type";
import { applyDrop, flattenBuckets, tierCollisionDetection } from "@/lib/utils/tier-dnd";
import { TierRow } from "@/components/tier-list/tier-row";
import { Toolbar } from "@/components/tier-list/toolbar";
import { TierListActions } from "@/components/tier-list/tier-list-actions";
import type { CatalogCounts } from "@/components/tier-list/tier-list-picker";
import { Toast } from "@/components/ui/toast";
import { useToast } from "@/lib/hooks/use-toast";
import { Poster } from "@/components/movie-card/poster";
import { ChannelThumbnail } from "@/components/channel-card/channel-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { trackItemRanked, trackListCreationStarted, trackListSaved } from "@/lib/analytics/events";
import { takeForkInteraction, takeForkToast } from "@/lib/storage/fork-handoff";
import { SITE_HOST } from "@/lib/seo/site";

/**
 * Which tier a board item currently sits in, or null if it is not on the board.
 * Analytics needs the tier the card came *from*, which the drop result no longer
 * remembers, so it is read off the pre-drop buckets.
 */
function tierOfKey(buckets: BoardBuckets, key: string): TierOrUnrated | null {
  for (const tier of TIER_ORDER) {
    if (buckets[tier].some((item) => boardItemKey(item) === key)) return tier;
  }
  return null;
}

/** `title:movie-603` / `channel:UC…` -> the id shape the analytics funnel uses. */
function analyticsItemId(boardKey: string): string {
  return boardKey.startsWith("channel:")
    ? `youtube-${boardKey.slice("channel:".length)}`
    : boardKey.slice("title:".length);
}

/**
 * Reports `list_creation_started` the first time a freshly forked board is
 * edited, then never again — the armed flag lives in sessionStorage and is
 * consumed on read, so no component has to remember whether it already fired.
 */
function noteForkInteraction(): void {
  const pending = takeForkInteraction();
  if (pending) trackListCreationStarted(pending.category, true, pending.originalListId);
}

export function TierListBoard() {
  const { titles, hydrated, remove, setTier, reorderAll } = useRankedTitles();
  const {
    channels,
    remove: removeChannel,
    setTier: setChannelTier,
    reorderAll: reorderAllChannels,
  } = useRankedChannels();
  const { density, setDensity } = useDensity();
  const [containers, setContainers] = useState<BoardBuckets>(() => groupBoard([]));
  const containersRef = useRef(containers);
  const draggingRef = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const { toast, show: notify } = useToast();

  useEffect(() => {
    // Read here rather than during render: there is no sessionStorage on the
    // server, so a render-phase read would desync hydration. The message is
    // removed as it is read, so this fires at most once per arrival.
    //
    // Notified synchronously on purpose. Deferring past a microtask — the
    // obvious way to keep a state setter out of an effect body — drops the
    // toast in development: the deferred call lands on the instance Strict Mode
    // throws away, and the confirmation never appears.
    const message = takeForkToast();
    if (message) notify(message);
  }, [notify]);

  const [search, setSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<SortMode>("manual");

  /**
   * Writes the ref and the state together, always in that order.
   *
   * The ref — not the `containers` state variable — is what every drag handler
   * reads. dnd-kit fires onDragOver and onDragEnd from the same burst of
   * pointer events and does not wait for React to commit in between, so a
   * handler reading state (or a ref synced from state by an effect, which is
   * strictly worse: it lands a full commit later) can see the board as it was
   * *before* the move it is supposed to finish. That is what made drops land
   * back in their original tier at random.
   */
  const commitContainers = useCallback((next: BoardBuckets) => {
    containersRef.current = next;
    setContainers(next);
  }, []);

  useEffect(() => {
    // Storage changed from somewhere else (quick tier menu, another tab, cloud
    // sync pulling down). Never while dragging — that would yank the board out
    // from under the pointer.
    if (!draggingRef.current) {
      containersRef.current = groupBoard(toBoardItems(titles, channels));
      setContainers(containersRef.current);
    }
  }, [titles, channels]);

  useEffect(() => {
    return () => {
      if (savedTimeout.current) clearTimeout(savedTimeout.current);
    };
  }, []);

  const flashSaved = useCallback(() => {
    setSaved(true);
    if (savedTimeout.current) clearTimeout(savedTimeout.current);
    savedTimeout.current = setTimeout(() => setSaved(false), 1500);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const isDefaultFilters = search === "" && mediaFilter === "all" && sort === "manual";

  /*
   * What each catalog holds, for the list picker. Counted over everything
   * ranked rather than over what the current filter shows, so the numbers keep
   * meaning the same thing while switching between lists.
   */
  const catalogCounts = useMemo<CatalogCounts>(() => {
    const counts: CatalogCounts = { movie: 0, tv: 0, anime: 0, game: 0, youtube: channels.length };
    for (const title of titles) counts[title.mediaType] += 1;
    return counts;
  }, [titles, channels]);

  /**
   * A media tab or a search term only *hides* cards — the ones still on screen
   * keep their real positions, and every drop is resolved against the full
   * list by item id (see handleDragEnd), so dragging on a filtered tab is
   * exactly as correct as on "All".
   *
   * A non-manual sort is the one case that genuinely cannot work: the visible
   * order is not the stored order, so "dropped between these two cards" has no
   * manual position to write back. Only that stays disabled.
   */
  const dragEnabled = sort === "manual";

  function handleDragStart(event: DragStartEvent) {
    draggingRef.current = true;
    setActiveId(String(event.active.id));
  }

  /**
   * Deliberately no onDragOver handler.
   *
   * Rewriting the board mid-drag to preview the move is a feedback loop here,
   * because these rows wrap and their height depends on what they hold. Moving
   * the card into the hovered row makes that row taller and its neighbours
   * shift, which slides a row boundary out from under a stationary pointer, so
   * the next collision pass resolves to the neighbouring row and moves the card
   * back — which restores the old heights and flips it again. dnd-kit
   * re-measures on every render (MeasuringStrategy.Always), so the two states
   * ping-pong until React aborts the render with "Maximum update depth
   * exceeded" and the page goes blank.
   *
   * The layout therefore stays completely still during a drag: the DragOverlay
   * carries the card under the cursor and the hovered row lights up via
   * `isOver`, which is feedback enough. The board changes exactly once, on drop.
   */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    draggingRef.current = false;
    setActiveId(null);
    if (!over) return;

    // `applyDrop` covers both shapes of drop under one rule: a same-tier
    // reorder and a cross-tier move. Persisting happens here, once, outside any
    // setState updater — `reorderAll` writes localStorage synchronously and
    // dispatches a change event, which React must not see inside a reducer
    // (Strict Mode double-invokes those, firing the write twice and letting the
    // `[titles]` effect stomp the fresh board with a stale snapshot).
    const movedKey = String(active.id);
    const fromTier = tierOfKey(containersRef.current, movedKey);
    const next = applyDrop(containersRef.current, movedKey, String(over.id), boardItemKey);
    if (next === containersRef.current) return;

    commitContainers(next);
    persist(next, movedKey);

    const toTier = tierOfKey(next, movedKey);
    if (toTier) {
      trackItemRanked(analyticsItemId(movedKey), toTier, fromTier ?? undefined);
    }
  }

  function handleDragCancel() {
    draggingRef.current = false;
    setActiveId(null);
  }

  /**
   * Writes the reordered board back to whichever store each row came from.
   *
   * Both stores are rewritten on every drop, even when only one kind moved: a
   * cross-tier drag changes the surrounding order in a tier that may hold both,
   * and splitting a partially-updated board across two writes is how the two
   * would drift apart.
   */
  function persist(next: BoardBuckets, movedKey: string) {
    const now = Date.now();
    const flat = flattenBuckets<BoardItem>(next, (item, index) => ({
      ...item,
      order: index,
    }));
    const { titles: nextTitles, channels: nextChannels } = splitBoardItems(flat);

    reorderAll(
      nextTitles.map((t) => ({
        ...t,
        updatedAt: `title:${t.mediaType}-${t.tmdbId}` === movedKey ? now : t.updatedAt,
      }))
    );
    reorderAllChannels(
      nextChannels.map((c) => ({
        ...c,
        updatedAt: `channel:${c.channelId}` === movedKey ? now : c.updatedAt,
      }))
    );
    flashSaved();

    // The board is the list: there is one per user and it saves on every drop,
    // so "saved" is reported here rather than behind a button that does not exist.
    trackListSaved("board", flat.length, false);
    noteForkInteraction();
  }

  const handleRemove = useCallback(
    (title: RankedTitle) => {
      remove(title.tmdbId, title.mediaType);
    },
    [remove]
  );

  const handleQuickTierChange = useCallback(
    (title: RankedTitle, tier: TierOrUnrated) => {
      setTier(title.tmdbId, title.mediaType, tier);
      flashSaved();
      trackItemRanked(`${title.mediaType}-${title.tmdbId}`, tier, title.tier);
      noteForkInteraction();
    },
    [setTier, flashSaved]
  );

  const handleRemoveChannel = useCallback(
    (channel: RankedChannel) => {
      removeChannel(channel.channelId);
    },
    [removeChannel]
  );

  const handleChannelTierChange = useCallback(
    (channel: RankedChannel, tier: TierOrUnrated) => {
      setChannelTier(channel.channelId, tier);
      flashSaved();
      trackItemRanked(`youtube-${channel.channelId}`, tier, channel.tier);
      noteForkInteraction();
    },
    [setChannelTier, flashSaved]
  );

  function handleReset() {
    setSearch("");
    setMediaFilter("all");
    setSort("manual");
  }

  const displayContainers = useMemo(() => {
    const result = {} as BoardBuckets;
    for (const tier of TIER_ORDER) {
      result[tier] = filterAndSortBoardItems(containers[tier], {
        search,
        category: mediaFilter,
        sort,
      });
    }
    return result;
  }, [containers, search, mediaFilter, sort]);

  const activeItem = activeId
    ? TIER_ORDER.flatMap((t) => containers[t]).find((i) => boardItemKey(i) === activeId)
    : undefined;

  if (!hydrated) {
    return (
      <div className="space-y-3 px-4 py-4 md:px-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  // Channels count too now that the board holds both, otherwise someone whose
  // list is only YouTube channels would be told it is empty.
  if (titles.length === 0 && channels.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-0 pb-6 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4 md:px-0 md:pt-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Tier list</h1>
          <p className="mt-1 text-sm text-muted">
            Drag titles between tiers to build your ranking.
          </p>
        </div>
        <TierListActions
          boardRef={boardRef}
          onNotify={notify}
          titles={titles}
          channels={channels}
        />
      </div>

      <div className="mt-4 px-4 md:px-0">
        <Toolbar
          counts={catalogCounts}
          search={search}
          onSearchChange={setSearch}
          mediaFilter={mediaFilter}
          onMediaFilterChange={setMediaFilter}
          sort={sort}
          onSortChange={setSort}
          density={density}
          onDensityChange={setDensity}
          onReset={handleReset}
          isDefault={isDefaultFilters}
          saved={saved}
        />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={tierCollisionDetection}
        // The board no longer mutates mid-drag (see handleDragEnd), so one
        // measurement per drag is both correct and enough. `Always` would
        // re-measure on every render, which is what let the old live preview
        // ping-pong a card between two rows until React gave up.
        measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div ref={boardRef} className="relative mt-4 space-y-3 bg-background px-4 py-2 md:px-0">
          {TIER_ORDER.map((tier) => (
            <TierRow
              key={tier}
              tier={tier}
              items={displayContainers[tier]}
              itemIds={displayContainers[tier].map(boardItemKey)}
              draggable={dragEnabled}
              filtersActive={!isDefaultFilters}
              density={density}
              onRemoveTitle={handleRemove}
              onRemoveChannel={handleRemoveChannel}
              onTitleTier={handleQuickTierChange}
              onChannelTier={handleChannelTierChange}
            />
          ))}
          {/* Invisible on screen; the export handler reveals it for the shot.
              The address is spelled out under the wordmark rather than left
              implied: a name alone sends anyone who liked the picture to a
              search box, and there is an unrelated site on a near-identical
              domain waiting at the end of that search. */}
          <div
            data-export-watermark
            className="pointer-events-none absolute bottom-1 right-3 flex flex-col items-end leading-tight opacity-0"
          >
            <span className="text-xs font-semibold tracking-tight">
              TierList<span className="text-accent">Online</span>
            </span>
            <span className="text-[10px] font-medium tracking-tight text-muted">{SITE_HOST}</span>
          </div>
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className={density === "compact" ? "w-16 sm:w-20" : "w-24 sm:w-28"}>
              {activeItem.kind === "title" ? (
                <Poster
                  posterPath={activeItem.title.posterPath}
                  title={activeItem.title.title}
                  sizes="120px"
                  className="shadow-xl ring-2 ring-accent"
                />
              ) : (
                <ChannelThumbnail
                  thumbnailUrl={activeItem.channel.thumbnailUrl}
                  title={activeItem.channel.title}
                  sizes="120px"
                  className="shadow-xl ring-2 ring-accent"
                />
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Toast toast={toast} />
    </div>
  );
}
