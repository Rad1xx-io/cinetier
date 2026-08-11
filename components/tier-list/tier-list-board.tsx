"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useDensity } from "@/lib/hooks/use-density";
import { TIER_ORDER } from "@/lib/types";
import type { RankedTitle, TierOrUnrated } from "@/lib/types";
import {
  filterAndSortTierItems,
  groupByTier,
  resolveContainer,
  tierItemKey,
  type MediaFilter,
  type SortMode,
  type TierContainers,
} from "@/lib/utils/tier-grouping";
import { TierRow } from "@/components/tier-list/tier-row";
import { Toolbar } from "@/components/tier-list/toolbar";
import { Poster } from "@/components/movie-card/poster";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";

export function TierListBoard() {
  const { titles, hydrated, remove, setTier, reorderAll } = useRankedTitles();
  const { density, setDensity } = useDensity();
  const [containers, setContainers] = useState<TierContainers>(() => groupByTier([]));
  const draggingRef = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, setSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [sort, setSort] = useState<SortMode>("manual");

  useEffect(() => {
    if (!draggingRef.current) {
      setContainers(groupByTier(titles));
    }
  }, [titles]);

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
  const dragEnabled = isDefaultFilters;

  function handleDragStart(event: DragStartEvent) {
    draggingRef.current = true;
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    // Container resolution happens *inside* the updater, against `prev` — never
    // against the `containers` state variable from the render closure. dnd-kit
    // can fire onDragOver and onDragEnd back-to-back faster than React commits
    // a render in between, so resolving against the outer closure was stale and
    // silently dropped cross-tier moves (see incident: item never left Unrated).
    setContainers((prev) => {
      const activeContainer = resolveContainer(prev, String(active.id));
      const overContainer = resolveContainer(prev, String(over.id));
      if (!activeContainer || !overContainer || activeContainer === overContainer) return prev;

      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.findIndex((t) => tierItemKey(t) === active.id);
      if (activeIndex === -1) return prev;
      const movedItem = activeItems[activeIndex];
      const overIndex = overItems.findIndex((t) => tierItemKey(t) === over.id);

      const newActiveItems = activeItems.filter((t) => tierItemKey(t) !== String(active.id));
      const insertAt = overIndex >= 0 ? overIndex : overItems.length;
      const newOverItems = [
        ...overItems.slice(0, insertAt),
        { ...movedItem, tier: overContainer },
        ...overItems.slice(insertAt),
      ];

      return { ...prev, [activeContainer]: newActiveItems, [overContainer]: newOverItems };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    draggingRef.current = false;
    setActiveId(null);
    if (!over) return;

    setContainers((prev) => {
      const activeContainer = resolveContainer(prev, String(active.id));
      const overContainer = resolveContainer(prev, String(over.id));
      if (!activeContainer || !overContainer) return prev;

      const items = prev[overContainer];
      const activeIndex = items.findIndex((t) => tierItemKey(t) === active.id);
      const overIndex = items.findIndex((t) => tierItemKey(t) === over.id);

      let next = prev;
      if (activeContainer === overContainer && activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        next = { ...prev, [overContainer]: arrayMove(items, activeIndex, overIndex) };
      }

      persist(next, String(active.id));
      return next;
    });
  }

  function persist(next: TierContainers, movedKey: string) {
    const now = Date.now();
    const flat: RankedTitle[] = [];
    for (const tier of TIER_ORDER) {
      next[tier].forEach((t, index) => {
        flat.push({
          ...t,
          order: index,
          updatedAt: tierItemKey(t) === movedKey ? now : t.updatedAt,
        });
      });
    }
    reorderAll(flat);
    flashSaved();
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
    },
    [setTier, flashSaved]
  );

  function handleReset() {
    setSearch("");
    setMediaFilter("all");
    setSort("manual");
  }

  const displayContainers = useMemo(() => {
    const result = {} as TierContainers;
    for (const tier of TIER_ORDER) {
      result[tier] = filterAndSortTierItems(containers[tier], { search, mediaFilter, sort });
    }
    return result;
  }, [containers, search, mediaFilter, sort]);

  const activeTitle = activeId
    ? TIER_ORDER.flatMap((t) => containers[t]).find((t) => tierItemKey(t) === activeId)
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

  if (titles.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-0 pb-6 md:px-6">
      <div className="px-4 pt-4 md:px-0 md:pt-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Тир-лист</h1>
        <p className="mt-1 text-sm text-muted">
          Перетаскивайте тайтлы между тирами, чтобы выстроить свой рейтинг.
        </p>
      </div>

      <div className="mt-4 px-4 md:px-0">
        <Toolbar
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
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="mt-4 space-y-3 px-4 md:px-0">
          {TIER_ORDER.map((tier) => (
            <TierRow
              key={tier}
              tier={tier}
              items={displayContainers[tier]}
              itemIds={displayContainers[tier].map(tierItemKey)}
              draggable={dragEnabled}
              filtersActive={!isDefaultFilters}
              density={density}
              onRemove={handleRemove}
              onQuickTierChange={handleQuickTierChange}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTitle ? (
            <div className={density === "compact" ? "w-16 sm:w-20" : "w-24 sm:w-28"}>
              <Poster
                posterPath={activeTitle.posterPath}
                title={activeTitle.title}
                sizes="120px"
                className="shadow-xl ring-2 ring-accent"
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
