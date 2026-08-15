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
import { useRankedChannels } from "@/lib/hooks/use-ranked-channels";
import { useDensity } from "@/lib/hooks/use-density";
import { TIER_ORDER } from "@/lib/types";
import type { TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import {
  channelItemKey,
  filterAndSortChannelItems,
  groupChannelsByTier,
  type ChannelSortMode,
  type ChannelTierContainers,
} from "@/lib/utils/channel-tier-grouping";
import { applyDrop, flattenBuckets, tierCollisionDetection } from "@/lib/utils/tier-dnd";
import { ChannelTierRow } from "@/components/youtube-tier-list/channel-tier-row";
import { ChannelToolbar } from "@/components/youtube-tier-list/channel-toolbar";
import { ChannelThumbnail } from "@/components/channel-card/channel-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelEmptyState } from "@/components/youtube-tier-list/channel-empty-state";

export function ChannelTierListBoard() {
  const { channels, hydrated, remove, setTier, reorderAll } = useRankedChannels();
  const { density, setDensity } = useDensity();
  const [containers, setContainers] = useState<ChannelTierContainers>(() => groupChannelsByTier([]));
  const containersRef = useRef(containers);
  const draggingRef = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ChannelSortMode>("manual");

  /** Ref and state written together — see the movies board for why the drag handlers must read the ref, never the state variable. */
  const commitContainers = useCallback((next: ChannelTierContainers) => {
    containersRef.current = next;
    setContainers(next);
  }, []);

  useEffect(() => {
    if (!draggingRef.current) {
      containersRef.current = groupChannelsByTier(channels);
      setContainers(containersRef.current);
    }
  }, [channels]);

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

  const isDefaultFilters = search === "" && sort === "manual";
  // Searching only hides cards and drops resolve by id against the full list,
  // so dragging stays valid while filtering. See the movies/TV board.
  const dragEnabled = sort === "manual";

  function handleDragStart(event: DragStartEvent) {
    draggingRef.current = true;
    setActiveId(String(event.active.id));
  }

  /**
   * No onDragOver handler, for the same reason as the movies/TV board: moving
   * the card between rows mid-drag resizes those rows, which slides a boundary
   * out from under a stationary pointer and flips the target back and forth
   * until React aborts with "Maximum update depth exceeded". The layout holds
   * still; the board changes once, on drop. See that board for the full writeup.
   */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    draggingRef.current = false;
    setActiveId(null);
    if (!over) return;

    const next = applyDrop(
      containersRef.current,
      String(active.id),
      String(over.id),
      channelItemKey
    );
    if (next === containersRef.current) return;

    commitContainers(next);
    persist(next, String(active.id));
  }

  function handleDragCancel() {
    draggingRef.current = false;
    setActiveId(null);
  }

  function persist(next: ChannelTierContainers, movedKey: string) {
    const now = Date.now();
    const flat = flattenBuckets<RankedChannel>(next, (c, index) => ({
      ...c,
      order: index,
      updatedAt: channelItemKey(c) === movedKey ? now : c.updatedAt,
    }));
    reorderAll(flat);
    flashSaved();
  }

  const handleRemove = useCallback(
    (channel: RankedChannel) => {
      remove(channel.channelId);
    },
    [remove]
  );

  const handleQuickTierChange = useCallback(
    (channel: RankedChannel, tier: TierOrUnrated) => {
      setTier(channel.channelId, tier);
      flashSaved();
    },
    [setTier, flashSaved]
  );

  function handleReset() {
    setSearch("");
    setSort("manual");
  }

  const displayContainers = useMemo(() => {
    const result = {} as ChannelTierContainers;
    for (const tier of TIER_ORDER) {
      result[tier] = filterAndSortChannelItems(containers[tier], { search, sort });
    }
    return result;
  }, [containers, search, sort]);

  const activeChannel = activeId
    ? TIER_ORDER.flatMap((t) => containers[t]).find((c) => channelItemKey(c) === activeId)
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

  if (channels.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <ChannelEmptyState />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-0 pb-6 md:px-6">
      <div className="px-4 pt-4 md:px-0 md:pt-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">YouTube channel tier list</h1>
        <p className="mt-1 text-sm text-muted">
          Drag channels between tiers to build your ranking.
        </p>
      </div>

      <div className="mt-4 px-4 md:px-0">
        <ChannelToolbar
          search={search}
          onSearchChange={setSearch}
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
        // The board holds still during a drag, so one measurement is enough.
        measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="mt-4 space-y-3 px-4 md:px-0">
          {TIER_ORDER.map((tier) => (
            <ChannelTierRow
              key={tier}
              tier={tier}
              items={displayContainers[tier]}
              itemIds={displayContainers[tier].map(channelItemKey)}
              draggable={dragEnabled}
              filtersActive={!isDefaultFilters}
              density={density}
              onRemove={handleRemove}
              onQuickTierChange={handleQuickTierChange}
            />
          ))}
        </div>

        <DragOverlay>
          {activeChannel ? (
            <div className={density === "compact" ? "w-16 sm:w-20" : "w-24 sm:w-28"}>
              <ChannelThumbnail
                thumbnailUrl={activeChannel.thumbnailUrl}
                title={activeChannel.title}
                className="shadow-xl ring-2 ring-accent"
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
