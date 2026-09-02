import { TIERS, type RankedTitle, type Tier } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import type { PostCategory, RankedChannelSnapshotEntry, RankedTitleSnapshotEntry } from "@/lib/supabase/feed";

/**
 * How much of a board a feed card shows: the first few *filled* tiers, a handful
 * of posters in each. Enough to read as a tier list at a glance without turning
 * the card into the page it links to.
 *
 * Three rows rather than four, and six narrow posters rather than five wide
 * ones: a feed is for scanning, and a card tall enough to fill a phone screen
 * stops being a feed item and becomes a page.
 */
export const MINI_BOARD_TIERS = 3;
export const MINI_BOARD_PER_ROW = 6;

export const POST_TITLE_MIN = 3;
export const POST_TITLE_MAX = 120;
export const POST_DESCRIPTION_MAX = 2000;

/**
 * The one line both publish dialogs show, worded identically on purpose.
 *
 * A separate thing from the upload dialog's "I confirm I have the right to use
 * this image" — that one is about a single picture, answered once per upload.
 * This is about the post as a whole, answered once per publish, and applies
 * just as much to a regular tier list (no uploaded pictures at all) as to a
 * Custom board.
 */
export const RULES_CONFIRMATION_LABEL = "I confirm this post follows the site's content rules.";

const TIER_RANK = new Map(TIERS.map((tier, index) => [tier, index]));

export interface MiniTierRow {
  tier: Tier;
  titles: RankedTitle[];
}

export interface MiniBoard {
  rows: MiniTierRow[];
  /**
   * Everything the card does not show — the overflow inside displayed rows plus
   * every entry in the tiers that did not fit. One number, because the card has
   * room for one line, and "N more" is only honest if N covers all of it.
   */
  hiddenCount: number;
}

/**
 * Every filled tier of a board, in tier order, each with all of its titles.
 *
 * Unrated entries are left out: a board preview exists to show what the author
 * thinks, and an unrated pile says nothing. Empty tiers are skipped rather than
 * rendered blank — a list that only uses S and F is two rows, not six.
 */
export function buildTierRows(titles: RankedTitle[]): MiniTierRow[] {
  const byTier = new Map<Tier, RankedTitle[]>();
  for (const title of titles) {
    if (!TIER_RANK.has(title.tier as Tier)) continue;
    const tier = title.tier as Tier;
    const bucket = byTier.get(tier);
    if (bucket) bucket.push(title);
    else byTier.set(tier, [title]);
  }

  const rows: MiniTierRow[] = [];
  for (const tier of TIERS) {
    const bucket = byTier.get(tier);
    if (!bucket || bucket.length === 0) continue;
    rows.push({
      tier,
      // Sorted so the same board always renders the same way rather than
      // shuffling between renders.
      titles: [...bucket].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    });
  }
  return rows;
}

/**
 * The capped projection a feed card shows — the first few filled tiers, a
 * handful of posters in each, and one number covering everything left out.
 */
export function buildMiniBoard(
  titles: RankedTitle[],
  options: { maxTiers?: number; perRow?: number } = {}
): MiniBoard {
  const maxTiers = Math.max(0, options.maxTiers ?? MINI_BOARD_TIERS);
  const perRow = Math.max(0, options.perRow ?? MINI_BOARD_PER_ROW);

  const all = buildTierRows(titles);
  const total = all.reduce((sum, row) => sum + row.titles.length, 0);

  const rows = all
    .slice(0, maxTiers)
    .map((row) => ({ tier: row.tier, titles: row.titles.slice(0, perRow) }));
  const shown = rows.reduce((sum, row) => sum + row.titles.length, 0);

  return { rows, hiddenCount: total - shown };
}

export interface ChannelTierRow {
  tier: Tier;
  channels: RankedChannel[];
}

export interface MiniChannelBoard {
  rows: ChannelTierRow[];
  hiddenCount: number;
}

/**
 * `buildTierRows`/`buildMiniBoard`, for the other store a board can be made
 * of. Kept as its own small pair rather than folded into the ones above:
 * `RankedChannel` has no `tmdbId` and no poster path, so a shared generic
 * would need a wider item type everywhere `MiniTierRow` is already used —
 * `TierBoard`, every card and dialog — for a form that is genuinely
 * different, the same reasoning `custom_list_publications` and
 * `ranked_title_publications` already settled on for storage (see
 * .ai/DECISIONS.md). A channel board is rendered by its own `ChannelBoard`
 * component instead, alongside `TierBoard`, not through it.
 */
export function buildChannelTierRows(channels: RankedChannel[]): ChannelTierRow[] {
  const byTier = new Map<Tier, RankedChannel[]>();
  for (const channel of channels) {
    if (!TIER_RANK.has(channel.tier as Tier)) continue;
    const tier = channel.tier as Tier;
    const bucket = byTier.get(tier);
    if (bucket) bucket.push(channel);
    else byTier.set(tier, [channel]);
  }

  const rows: ChannelTierRow[] = [];
  for (const tier of TIERS) {
    const bucket = byTier.get(tier);
    if (!bucket || bucket.length === 0) continue;
    rows.push({
      tier,
      channels: [...bucket].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    });
  }
  return rows;
}

export function buildMiniChannelBoard(
  channels: RankedChannel[],
  options: { maxTiers?: number; perRow?: number } = {}
): MiniChannelBoard {
  const maxTiers = Math.max(0, options.maxTiers ?? MINI_BOARD_TIERS);
  const perRow = Math.max(0, options.perRow ?? MINI_BOARD_PER_ROW);

  const all = buildChannelTierRows(channels);
  const total = all.reduce((sum, row) => sum + row.channels.length, 0);

  const rows = all
    .slice(0, maxTiers)
    .map((row) => ({ tier: row.tier, channels: row.channels.slice(0, perRow) }));
  const shown = rows.reduce((sum, row) => sum + row.channels.length, 0);

  return { rows, hiddenCount: total - shown };
}

/** "one tier" / "N tiers", shared by the titles and channels captions in the dialog. */
export function tierCountPhrase(rowCount: number): string {
  return rowCount === 1 ? "one tier" : `${rowCount} tiers`;
}

/**
 * Groups one flat query of many authors' titles by author.
 *
 * The feed fetches every visible card's titles in a single round trip — one
 * query per card would be a dozen requests for one screen — so the splitting
 * happens here rather than in the database. No cap: each card decides how much
 * of its author's board it can show.
 */
export function titlesByAuthor(
  titles: (RankedTitle & { userId: string })[]
): Map<string, RankedTitle[]> {
  const byAuthor = new Map<string, RankedTitle[]>();
  for (const title of titles) {
    const bucket = byAuthor.get(title.userId);
    if (bucket) bucket.push(title);
    else byAuthor.set(title.userId, [title]);
  }
  return byAuthor;
}

/** `titlesByAuthor`, for channels. */
export function channelsByAuthor(
  channels: (RankedChannel & { userId: string })[]
): Map<string, RankedChannel[]> {
  const byAuthor = new Map<string, RankedChannel[]>();
  for (const channel of channels) {
    const bucket = byAuthor.get(channel.userId);
    if (bucket) bucket.push(channel);
    else byAuthor.set(channel.userId, [channel]);
  }
  return byAuthor;
}

export type PostValidation = { ok: true } | { ok: false; error: string };

/**
 * Mirrors the CHECK constraints in migration 009, so the form rejects exactly
 * what the database would rather than letting a write fail at the far end.
 */
export function validatePost(title: string, description: string): PostValidation {
  const trimmed = title.trim();
  if (trimmed.length < POST_TITLE_MIN) return { ok: false, error: "The title is too short." };
  if (trimmed.length > POST_TITLE_MAX) {
    return { ok: false, error: `The title is longer than ${POST_TITLE_MAX} characters.` };
  }
  if (description.length > POST_DESCRIPTION_MAX) {
    return { ok: false, error: `The description is longer than ${POST_DESCRIPTION_MAX} characters.` };
  }
  return { ok: true };
}

/** Two letters for the avatar circle — profiles carry no picture. */
export function avatarInitials(displayName: string | null, username: string): string {
  const source = (displayName?.trim() || username).replace(/^@/, "");
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * The category a board is mostly made of, used to pre-fill the publish form.
 *
 * "mixed" when no single kind clearly dominates — a board that is half films and
 * half games is genuinely both, and filing it under one would mislead the feed
 * filter more than it would help.
 */
export function suggestedPostCategory(
  titles: RankedTitle[],
  channels: { tier: string }[] = []
): PostCategory {
  const counts = new Map<PostCategory, number>();
  for (const title of titles) {
    counts.set(title.mediaType, (counts.get(title.mediaType) ?? 0) + 1);
  }
  if (channels.length > 0) counts.set("youtube", channels.length);

  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (total === 0) return "mixed";

  let best: PostCategory = "mixed";
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }

  // A bare plurality is not a theme; over half the board is.
  return bestCount * 2 > total ? best : "mixed";
}

/**
 * What a post actually shows: the frozen placement, with catalogue facts —
 * name, poster, release date — filled in from whatever the author's board
 * looks like right now.
 *
 * `undefined` means the post predates snapshots; the live board is shown
 * whole, exactly as it always was. Given a snapshot, a title the live board no
 * longer has (the author un-ranked it since publishing) is left out rather
 * than guessed at — a gap, the same way a taken-down custom card leaves one,
 * not a reason to fail the whole post.
 */
export function resolveSnapshotTitles(
  snapshot: RankedTitleSnapshotEntry[] | undefined,
  liveTitles: RankedTitle[]
): RankedTitle[] {
  if (!snapshot) return liveTitles;

  const live = new Map(liveTitles.map((t) => [`${t.tmdbId}:${t.mediaType}`, t]));
  const resolved: RankedTitle[] = [];
  for (const entry of snapshot) {
    const found = live.get(`${entry.tmdbId}:${entry.mediaType}`);
    if (!found) continue;
    resolved.push({ ...found, tier: entry.tier, order: entry.order });
  }
  return resolved;
}

/**
 * `resolveSnapshotTitles`, for channels. Keyed by `channelId` alone — unlike a
 * title, a channel has no second store it could collide with under the same id.
 */
export function resolveSnapshotChannels(
  snapshot: RankedChannelSnapshotEntry[] | undefined,
  liveChannels: RankedChannel[]
): RankedChannel[] {
  if (!snapshot) return liveChannels;

  const live = new Map(liveChannels.map((c) => [c.channelId, c]));
  const resolved: RankedChannel[] = [];
  for (const entry of snapshot) {
    const found = live.get(entry.channelId);
    if (!found) continue;
    resolved.push({ ...found, tier: entry.tier, order: entry.order });
  }
  return resolved;
}
