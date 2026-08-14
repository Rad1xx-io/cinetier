import { TIER_ORDER, type RankedTitle, type TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import { titleKey } from "@/lib/storage/repository";

/**
 * What to do with the entries the viewer already ranked.
 *
 * `replace` throws them away and adopts the author's board wholesale; `merge`
 * keeps them and only brings in what is missing.
 */
export type ForkStrategy = "replace" | "merge";

/**
 * The part of a ranked entry a fork actually manipulates. Titles and channels
 * live in separate stores with different ids, but they sit on the same board and
 * copy under exactly the same rules, so the logic is written once against this.
 */
interface Rankable {
  tier: TierOrUnrated;
  order: number;
  addedAt: number;
  updatedAt: number;
}

export interface ForkResult<T> {
  items: T[];
  /** Entries the fork actually brought in. */
  added: number;
  /** The viewer's own entries that survived — always 0 for `replace`. */
  kept: number;
}

const TIER_RANK = new Map(TIER_ORDER.map((tier, index) => [tier, index]));

/** Board order: by tier, then by position within the tier. */
export function sortByBoardPosition<T extends Rankable>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (TIER_RANK.get(a.tier) ?? 0) - (TIER_RANK.get(b.tier) ?? 0) || a.order - b.order
  );
}

/**
 * Renumbers `order` to 0..n within each tier, following the array's sequence.
 *
 * A fork splices two lists together, so the incoming positions collide with the
 * existing ones — without this, two cards in the same tier can claim the same
 * slot and the board's sort becomes arbitrary.
 */
export function normaliseOrder<T extends Rankable>(items: T[]): T[] {
  const nextOrder = new Map<string, number>();
  return items.map((item) => {
    const order = nextOrder.get(item.tier) ?? 0;
    nextOrder.set(item.tier, order + 1);
    return item.order === order ? item : { ...item, order };
  });
}

/**
 * Builds the list that results from forking `source` onto `current`.
 *
 * Pure: takes both lists, returns the new one, touches no storage. On `merge`
 * the viewer's own entry always wins a collision — a merge that silently
 * overwrote your rating with someone else's would be the one outcome nobody
 * asks for, so the author's tier is only used for entries you had never ranked.
 */
export function forkItems<T extends Rankable>(
  current: T[],
  source: T[],
  strategy: ForkStrategy,
  keyOf: (item: T) => string,
  now: number = Date.now()
): ForkResult<T> {
  const incoming = sortByBoardPosition(source).map((item) => ({
    ...item,
    addedAt: now,
    updatedAt: now,
  }));

  if (strategy === "replace") {
    return { items: normaliseOrder(incoming), added: incoming.length, kept: 0 };
  }

  const mine = new Set(current.map(keyOf));
  const added = incoming.filter((item) => !mine.has(keyOf(item)));

  return {
    // The viewer's entries go first so they keep the top slots of every tier.
    items: normaliseOrder([...sortByBoardPosition(current), ...added]),
    added: added.length,
    kept: current.length,
  };
}

/**
 * Forks the title half of a board.
 *
 * The author's per-criterion breakdown is deliberately dropped. It is their
 * private judgement of *why* a title sits where it does, not part of the
 * arrangement being copied — carrying it across would put a stranger's numbers
 * under "Своя оценка" on the forker's card, which is worse than showing none.
 * The tier itself is copied, because the tier is the thing being forked.
 */
export function forkTitles(
  current: RankedTitle[],
  source: RankedTitle[],
  strategy: ForkStrategy,
  now: number = Date.now()
): ForkResult<RankedTitle> {
  const withoutCriteria = source.map((title) => {
    const copy = { ...title };
    delete copy.criteriaScores;
    return copy;
  });

  return forkItems(
    current,
    withoutCriteria,
    strategy,
    (title) => titleKey(title.tmdbId, title.mediaType),
    now
  );
}

/**
 * Forks the channel half of the same board.
 *
 * Channels are a separate store, so a fork has to write both or it copies only
 * part of what the visitor was looking at. Nothing here needs stripping —
 * channels carry no private breakdown.
 */
export function forkChannels(
  current: RankedChannel[],
  source: RankedChannel[],
  strategy: ForkStrategy,
  now: number = Date.now()
): ForkResult<RankedChannel> {
  return forkItems(current, source, strategy, (channel) => channel.channelId, now);
}
