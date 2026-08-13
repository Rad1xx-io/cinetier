import {
  closestCenter,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from "@dnd-kit/core";
import { TIER_ORDER } from "@/lib/types";
import type { TierOrUnrated } from "@/lib/types";

/** Anything a tier list can hold — both RankedTitle and RankedChannel satisfy this. */
export interface TierPlaceable {
  tier: TierOrUnrated;
}

export type TierBuckets<T> = Record<TierOrUnrated, T[]>;

/** Extracts the dnd-kit id for an item (tierItemKey / channelItemKey). */
export type KeyOf<T> = (item: T) => string;

/**
 * Resolves a dnd-kit id to the tier that owns it — either the id *is* a tier
 * (the row's own droppable, used when dropping on empty space or on the tier
 * label) or it's an item key sitting in one of the buckets.
 */
export function findTier<T>(
  buckets: TierBuckets<T>,
  id: string,
  keyOf: KeyOf<T>
): TierOrUnrated | undefined {
  if ((TIER_ORDER as string[]).includes(id)) return id as TierOrUnrated;
  return TIER_ORDER.find((tier) => buckets[tier].some((item) => keyOf(item) === id));
}

/**
 * Moves `activeId` into the tier owning `overId`, inserted at that item's
 * position (appended when `overId` is a tier itself). Returns the *same object*
 * when nothing moves, so callers can cheaply skip a re-render.
 */
export function moveItemToTier<T extends TierPlaceable>(
  buckets: TierBuckets<T>,
  activeId: string,
  overId: string,
  keyOf: KeyOf<T>
): TierBuckets<T> {
  const from = findTier(buckets, activeId, keyOf);
  const to = findTier(buckets, overId, keyOf);
  if (!from || !to || from === to) return buckets;

  const fromItems = buckets[from];
  const activeIndex = fromItems.findIndex((item) => keyOf(item) === activeId);
  if (activeIndex === -1) return buckets;

  // Spreading a generic widens to `T & { tier }`; the assertion keeps the
  // bucket's element type without loosening T itself.
  const moved = { ...fromItems[activeIndex], tier: to } as T;
  const toItems = buckets[to];
  const overIndex = toItems.findIndex((item) => keyOf(item) === overId);
  const insertAt = overIndex >= 0 ? overIndex : toItems.length;

  return {
    ...buckets,
    [from]: fromItems.filter((item) => keyOf(item) !== activeId),
    [to]: [...toItems.slice(0, insertAt), moved, ...toItems.slice(insertAt)],
  };
}

/** Reorders within a single tier. Returns the same object when nothing moves. */
export function reorderWithinTier<T extends TierPlaceable>(
  buckets: TierBuckets<T>,
  activeId: string,
  overId: string,
  keyOf: KeyOf<T>
): TierBuckets<T> {
  const tier = findTier(buckets, activeId, keyOf);
  if (!tier) return buckets;

  const items = buckets[tier];
  const activeIndex = items.findIndex((item) => keyOf(item) === activeId);
  const overIndex = items.findIndex((item) => keyOf(item) === overId);
  if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return buckets;

  const next = [...items];
  const [moved] = next.splice(activeIndex, 1);
  next.splice(overIndex, 0, moved);
  return { ...buckets, [tier]: next };
}

/**
 * The single drop resolver shared by onDragOver and onDragEnd.
 *
 * Both handlers must agree on what a given (active, over) pair means, because
 * either one can be the *only* one that runs: a slow drag fires onDragOver
 * repeatedly and onDragEnd sees the move already applied (a same-tier no-op),
 * while a fast flick-and-release fires onDragEnd alone and has to perform the
 * cross-tier move itself. Routing both through this function makes those two
 * paths produce identical results instead of one of them silently dropping the
 * move.
 */
export function applyDrop<T extends TierPlaceable>(
  buckets: TierBuckets<T>,
  activeId: string,
  overId: string,
  keyOf: KeyOf<T>
): TierBuckets<T> {
  const from = findTier(buckets, activeId, keyOf);
  const to = findTier(buckets, overId, keyOf);
  if (!from || !to) return buckets;

  return from === to
    ? reorderWithinTier(buckets, activeId, overId, keyOf)
    : moveItemToTier(buckets, activeId, overId, keyOf);
}

function isTierId(id: string): boolean {
  return (TIER_ORDER as string[]).includes(id);
}

/**
 * Collision detection tuned for tier rows.
 *
 * The rows are full-width droppables (~1200px) while the cards are ~100px, and
 * `closestCorners` — dnd-kit's usual pick for sortable lists — sums the
 * distances between all four corners of the dragged card and each droppable.
 * The two right-hand corners of every row sit ~1000px away and contribute
 * almost exactly the same amount for *every* row, swamping the vertical
 * difference that actually distinguishes them. The dragged card's own sortable
 * rect, meanwhile, is directly under the pointer at a distance of ~0, so it
 * wins and the drop resolves to "onto itself" — a no-op.
 *
 * The visible symptom: a freshly added card could only be dropped into the
 * topmost row and the row it already sat in, because those were the only
 * places far enough from its origin for a row to beat it.
 *
 * The pointer is unambiguous, so trust it first: whatever lies under the cursor
 * is the target, preferring a card over the row containing it so drops land at
 * a precise index rather than always appending. `closestCenter` covers keyboard
 * dragging, where there is no pointer — every row shares the same center x, so
 * that comparison cleanly reduces to vertical distance.
 */
export const tierCollisionDetection: CollisionDetection = (args) => {
  const notSelf = (collision: { id: string | number }) => collision.id !== args.active.id;

  if (args.pointerCoordinates) {
    const underPointer = pointerWithin(args).filter(notSelf);
    if (underPointer.length > 0) {
      const card = underPointer.find((collision) => !isTierId(String(collision.id)));
      return card ? [card] : underPointer;
    }
  }

  // Pointer outside every row (dragged past the edges) — fall back to geometry.
  const intersecting = rectIntersection(args).filter(notSelf);
  return intersecting.length > 0 ? intersecting : closestCenter(args).filter(notSelf);
};

/** Flattens buckets back to a storage-ready list, renumbering `order` per tier. */
export function flattenBuckets<T extends TierPlaceable>(
  buckets: TierBuckets<T>,
  stamp: (item: T, index: number) => T
): T[] {
  const flat: T[] = [];
  for (const tier of TIER_ORDER) {
    buckets[tier].forEach((item, index) => flat.push(stamp(item, index)));
  }
  return flat;
}
