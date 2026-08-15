"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Dices,
  Loader2,
  Share2,
  Sparkles,
  Swords,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Poster } from "@/components/movie-card/poster";
import { createBattle } from "@/lib/supabase/battles";
import { trackEvent } from "@/lib/analytics/tracker";
import { trackLinkCopied, trackShareClicked } from "@/lib/analytics/events";
import {
  bestCategory,
  buildBattlePool,
  clampPoolSize,
  DEFAULT_POOL_SIZE,
  MAX_POOL_SIZE,
  MIN_POOL_SIZE,
  poolSizes,
  tierCounts,
  toBattleItems,
  toCandidates,
  toCreatorRatings,
  type PoolCandidate,
} from "@/lib/battle/pool";
import { BATTLE_PRESETS, presetBySlug, shufflePreset, titlesMatch } from "@/lib/battle/presets";
import { BattleVoting } from "@/components/battle/battle-voting";
import { TIERS, type Tier, type RankedTitle } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import type { BattleCategory } from "@/lib/types/battle";
import { tierColorVar } from "@/lib/utils/tier-style";
import { cn } from "@/lib/utils/cn";

const CATEGORY_LABELS: Record<BattleCategory, string> = {
  cinema: "Film",
  anime: "Anime",
  games: "Games",
  youtube: "YouTube",
};

/** Where the line-up comes from. */
type Source = "list" | "preset";

interface CreateBattleModalProps {
  open: boolean;
  onClose: () => void;
  titles: RankedTitle[];
  channels?: RankedChannel[];
}

function canWebShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * Turns a tier list — or a ready-made set — into a battle link.
 *
 * A native <dialog> for the same reasons as the username dialog: focus trapping,
 * Escape and the backdrop come free, and this one blocks on a network write.
 */
export function CreateBattleModal({
  open,
  onClose,
  titles,
  channels = [],
}: CreateBattleModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // Both stores are flattened once, here, so nothing below has to know which one
  // an entry came from.
  const candidates = useMemo(() => toCandidates(titles, channels), [titles, channels]);
  const byId = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates]
  );
  const sizes = useMemo(() => poolSizes(candidates), [candidates]);

  const [source, setSource] = useState<Source>("list");
  const [category, setCategory] = useState<BattleCategory>(() => bestCategory(candidates));
  const [presetSlug, setPresetSlug] = useState<string>(BATTLE_PRESETS[0]?.slug ?? "");
  /** Bumped to deal a different hand from the same pool. */
  const [presetSeed, setPresetSeed] = useState(0);
  const [tierFilter, setTierFilter] = useState<Set<Tier>>(new Set(TIERS));
  const [limit, setLimit] = useState(DEFAULT_POOL_SIZE);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  /** Tiers the creator assigns to preset entries they had not ranked before. */
  const [presetRatings, setPresetRatings] = useState<Record<string, Tier>>({});
  /**
   * `setup` picks the line-up; `rating` is the author's own blind pass over the
   * entries they have never ranked. Nothing is written until that pass finishes,
   * so a half-rated battle can never exist for a friend to open.
   */
  const [step, setStep] = useState<"setup" | "rating">("setup");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [battleId, setBattleId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset on each opening rather than in an effect: a stale pool or a leftover
  // link from the previous battle is worse than recomputing on the way in.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSource("list");
      setCategory(bestCategory(candidates));
      setTierFilter(new Set(TIERS));
      setLimit(DEFAULT_POOL_SIZE);
      setExcluded(new Set());
      setPresetRatings({});
      setPresetSeed(0);
      setStep("setup");
      setError(null);
      setBattleId(null);
      setCopied(false);
    }
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const preset = presetBySlug(presetSlug);
  const counts = useMemo(() => tierCounts(candidates, category), [candidates, category]);

  /**
   * A preset row carries a tier only once the creator has one for it — either
   * from their own list or assigned here. Rows without one are shown but cannot
   * take part: a battle compares tiers, and there is nothing to compare against.
   */
  const presetRows = useMemo(() => {
    if (!preset) return [];
    return shufflePreset(preset.items, presetSeed)
      .slice(0, limit)
      .map((item, index) => {
        // The id is only half the match — see `titlesMatch` for why a curated id
        // is not trusted on its own to carry someone's rating across.
        const candidate = byId.get(item.id);
        const own = candidate && titlesMatch(candidate.title, item.title) ? candidate : undefined;
        const tier = presetRatings[item.id] ?? own?.tier;
        return {
          id: item.id,
          title: item.title,
          posterUrl: own?.posterUrl,
          category: preset.category,
          order: index,
          tier,
          fromOwnList: Boolean(own),
        };
      });
  }, [preset, byId, presetRatings, presetSeed, limit]);

  const listPool = useMemo(
    () => buildBattlePool(candidates, category, { limit, tiers: [...tierFilter] }),
    [candidates, category, limit, tierFilter]
  );

  const selected: PoolCandidate[] =
    source === "list"
      ? listPool.filter((candidate) => !excluded.has(candidate.id))
      : presetRows
          .filter((row): row is typeof row & { tier: Tier } => Boolean(row.tier))
          .filter((row) => !excluded.has(row.id))
          .map(({ id, title, posterUrl, category: rowCategory, tier, order }) => ({
            id,
            title,
            category: rowCategory,
            tier,
            order,
            ...(posterUrl ? { posterUrl } : {}),
          }));

  /**
   * Preset entries the author has never ranked. They do not block the battle any
   * more — the author rates them in one blind pass instead, which is the whole
   * point of picking a ready-made set you have not worked through.
   */
  const unrated =
    source === "preset"
      ? presetRows.filter((row) => !row.tier && !excluded.has(row.id))
      : [];

  const enough = selected.length >= MIN_POOL_SIZE;
  /** Enough only once the author has rated what is missing. */
  const enoughAfterRating = selected.length + unrated.length >= MIN_POOL_SIZE;
  const needsOwnPass = source === "preset" && unrated.length > 0 && enoughAfterRating;
  const activeCategory = source === "list" ? category : (preset?.category ?? "cinema");

  function toggleExcluded(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTier(tier: Tier) {
    setTierFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }

  /** Turns a preset row into the shape `createBattle` stores. */
  function toCandidate(row: {
    id: string;
    title: string;
    posterUrl?: string;
    category: BattleCategory;
    order: number;
    tier: Tier;
  }): PoolCandidate {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      tier: row.tier,
      order: row.order,
      ...(row.posterUrl ? { posterUrl: row.posterUrl } : {}),
    };
  }

  function handleSubmit() {
    if (needsOwnPass) {
      setError(null);
      setStep("rating");
      return;
    }
    void createFrom(selected);
  }

  /**
   * The author has finished their own pass. Their answers are merged with the
   * tiers they already had and the battle is built from the union — recomputed
   * here rather than read back from state, which has not re-rendered yet.
   */
  function handleOwnPassComplete(ratings: Record<string, string>) {
    const merged = { ...presetRatings, ...(ratings as Record<string, Tier>) };
    setPresetRatings(merged);
    setStep("setup");

    const finalSelection = presetRows
      .filter((row) => !excluded.has(row.id))
      .map((row) => ({ ...row, tier: merged[row.id] ?? row.tier }))
      .filter((row): row is typeof row & { tier: Tier } => Boolean(row.tier))
      .map(toCandidate);

    if (finalSelection.length < MIN_POOL_SIZE) {
      // Skipping is allowed during the pass, so it can end below the floor.
      // What was rated is kept — the author only has to fill the gap.
      setError(
        `${finalSelection.length} of the ${MIN_POOL_SIZE} needed are rated. Rate a few more — skipped entries do not go into the battle.`
      );
      return;
    }

    void createFrom(finalSelection);
  }

  async function createFrom(finalSelection: PoolCandidate[]) {
    setCreating(true);
    setError(null);

    const id = await createBattle(
      activeCategory,
      toBattleItems(finalSelection),
      toCreatorRatings(finalSelection)
    );

    setCreating(false);
    if (!id) {
      setError("Could not create the battle. Check your connection and try again.");
      return;
    }

    setBattleId(id);
    trackEvent("battle_created", {
      battle_id: id,
      category: activeCategory,
      items_count: finalSelection.length,
      source,
      ...(source === "preset" ? { preset: presetSlug } : {}),
    });
  }

  const link = battleId ? `${window.location.origin}/battle/${battleId}` : "";

  async function handleShare() {
    if (!battleId) return;
    trackShareClicked("battle", battleId);

    if (canWebShare()) {
      try {
        await navigator.share({
          title: "TierListOnline — Taste Battle",
          text: "Rate the same line-up I did and see how close we land:",
          url: link,
        });
        return;
      } catch {
        // A dismissed sheet rejects too — fall through to copying rather than
        // treating a cancelled share as a failure.
      }
    }

    try {
      await navigator.clipboard.writeText(link);
      trackLinkCopied("battle", battleId);
      setCopied(true);
    } catch {
      window.prompt("Copy the link:", link);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      // Capped and scrollable so the picker cannot run off a phone screen; the
      // width tracks the viewport rather than a fixed rem value.
      className="m-auto max-h-[92dvh] w-[min(34rem,94vw)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <Swords className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              {step === "rating"
                ? "Rate them yourself first"
                : battleId
                  ? "Link ready"
                  : "Taste Battle"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {step === "rating"
                ? `${unrated.length} to rate blind — then you get the link.`
                : battleId
                  ? "Send it to a friend — they rate the same line-up and you see how closely you match."
                  : "A friend rates your line-up blind, and we work out how closely your taste matches."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {step === "rating" ? (
          <div className="mt-2">
            <p className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-muted">
              Rate the entries that are not on your board. A friend plays the same line-up and we
              compare the answers — so rate them as honestly as you would your own.
            </p>
            {/* The same component the friend will play, so the author's answers
                are produced exactly the way the answers they are compared against
                will be — one card at a time, nothing else on screen. */}
            <BattleVoting
              items={unrated.map((row) => ({
                id: row.id,
                title: row.title,
                category: row.category,
                ...(row.posterUrl ? { posterUrl: row.posterUrl } : {}),
              }))}
              onComplete={handleOwnPassComplete}
              submitting={creating}
            />
            <div className="mt-2 flex justify-start">
              <Button variant="ghost" size="sm" onClick={() => setStep("setup")} disabled={creating}>
                Back to the line-up
              </Button>
            </div>
          </div>
        ) : battleId ? (
          <div className="mt-5">
            <p className="truncate rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm">
              {link}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button onClick={handleShare} className="flex-1">
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : canWebShare() ? (
                  <Share2 className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copied ? "Link copied" : "Share the link"}
              </Button>
              <Button variant="secondary" onClick={onClose} className="sm:w-auto">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-border p-0.5"
              role="group"
              aria-label="Line-up source"
            >
              {(
                [
                  ["list", "My tier list"],
                  ["preset", "Presets"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSource(value);
                    setExcluded(new Set());
                  }}
                  aria-pressed={source === value}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                    source === value
                      ? "bg-accent text-accent-foreground"
                      : "text-muted hover:text-foreground"
                  )}
                >
                  {value === "preset" && <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                  {label}
                </button>
              ))}
            </div>

            {source === "list" ? (
              <>
                <div
                  className="mt-3 flex flex-wrap gap-1 rounded-lg border border-border p-0.5"
                  role="group"
                  aria-label="Battle category"
                >
                  {(Object.keys(CATEGORY_LABELS) as BattleCategory[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setCategory(value);
                        // Exclusions are per-pool; carrying them across categories
                        // would silently drop items the user never saw.
                        setExcluded(new Set());
                      }}
                      disabled={sizes[value] === 0}
                      aria-pressed={category === value}
                      className={cn(
                        "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                        category === value
                          ? "bg-accent text-accent-foreground"
                          : "text-muted hover:text-foreground"
                      )}
                    >
                      {CATEGORY_LABELS[value]}
                      <span className="ml-1 opacity-70">{sizes[value]}</span>
                    </button>
                  ))}
                </div>

                <fieldset className="mt-3">
                  <legend className="text-xs text-muted">
                    Tiers to include — build a “worst of the worst” if you like
                  </legend>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {TIERS.map((tier) => {
                      const active = tierFilter.has(tier);
                      const available = counts[tier] ?? 0;
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => toggleTier(tier)}
                          disabled={available === 0}
                          aria-pressed={active}
                          className={cn(
                            "flex h-9 min-w-11 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-bold transition-colors disabled:opacity-30",
                            active
                              ? "border-transparent text-background"
                              : "border-border text-muted hover:text-foreground"
                          )}
                          style={active ? { backgroundColor: tierColorVar(tier) } : undefined}
                        >
                          {tier}
                          <span className="text-[10px] font-medium opacity-80">{available}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </>
            ) : (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted">
                    {preset ? `${preset.items.length} in the pool` : "Pick a preset"}
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => setPresetSeed((s) => s + 1)}>
                    <Dices className="h-3.5 w-3.5" aria-hidden />
                    Shuffle
                  </Button>
                </div>
                {BATTLE_PRESETS.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => {
                      // Re-picking the set you are already on is the other way
                      // to ask for a reroll, alongside the button below.
                      setPresetSeed((seed) => (item.slug === presetSlug ? seed + 1 : 0));
                      setPresetSlug(item.slug);
                      setExcluded(new Set());
                    }}
                    aria-pressed={presetSlug === item.slug}
                    className={cn(
                      "w-full rounded-lg border p-2.5 text-left transition-colors",
                      presetSlug === item.slug
                        ? "border-accent/40 bg-surface-raised"
                        : "border-border hover:bg-white/5"
                    )}
                  >
                    <span className="block text-sm font-medium">{item.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">{item.description}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4">
              <label htmlFor="battle-size" className="flex items-baseline justify-between text-xs">
                <span className="text-muted">Maximum entries</span>
                <span className="font-semibold tabular-nums">{limit}</span>
              </label>
              <input
                id="battle-size"
                type="range"
                min={MIN_POOL_SIZE}
                max={MAX_POOL_SIZE}
                step={1}
                value={limit}
                onChange={(e) => setLimit(clampPoolSize(Number(e.target.value)))}
                className="mt-1.5 h-9 w-full accent-[var(--accent)]"
              />
              <p className="text-[11px] text-muted">
                Every entry is rated by hand — the longer the line-up, the fewer people finish it.
              </p>
            </div>

            <BattleItemList
              rows={
                source === "list"
                  ? listPool.map((candidate) => ({ ...candidate, fromOwnList: true }))
                  : presetRows
              }
              excluded={excluded}
              onToggle={toggleExcluded}
              onRate={
                source === "preset"
                  ? (id, tier) => setPresetRatings((prev) => ({ ...prev, [id]: tier }))
                  : undefined
              }
              selectedCount={selected.length}
            />

            {needsOwnPass ? (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
                <Swords className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                {unrated.length === presetRows.filter((r) => !excluded.has(r.id)).length
                  ? `You have not rated any of these — you play the line-up blind first, then get a link to send.`
                  : `${unrated.length} have no rating from you. You rate those before sending the link.`}
              </p>
            ) : (
              !enough && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  At least {MIN_POOL_SIZE} entries are needed — below that the match percentage means
                  nothing.
                </p>
              )
            )}

            {error && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-tier-s">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={creating || (!enough && !needsOwnPass)}
              >
                {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {needsOwnPass ? "Rate and create" : "Create battle"}
              </Button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

interface ItemRow {
  id: string;
  title: string;
  posterUrl?: string;
  tier?: Tier;
  fromOwnList: boolean;
}

function BattleItemList({
  rows,
  excluded,
  onToggle,
  onRate,
  selectedCount,
}: {
  rows: ItemRow[];
  excluded: Set<string>;
  onToggle: (id: string) => void;
  /** Present only in preset mode, where a row may have no tier yet. */
  onRate?: (id: string, tier: Tier) => void;
  selectedCount: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-border bg-surface-raised px-3 py-3 text-sm text-muted">
        Nothing here fits yet. Put some things in tiers and come back.
      </p>
    );
  }

  return (
    <>
      <p className="mt-4 text-xs text-muted">
        {selectedCount} of {rows.length} selected. Untick anything you would rather leave out.
      </p>

      <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto overscroll-contain pr-1 scrollbar-thin sm:max-h-64">
        {rows.map((row) => {
          const isSelected = Boolean(row.tier) && !excluded.has(row.id);
          return (
            <li key={row.id}>
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-1.5 transition-colors",
                  isSelected ? "border-accent/40 bg-surface-raised" : "border-border"
                )}
              >
                <button
                  type="button"
                  onClick={() => row.tier && onToggle(row.id)}
                  disabled={!row.tier}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2.5 text-left transition-opacity",
                    isSelected ? "" : "opacity-50 hover:opacity-80",
                    row.tier ? "" : "cursor-default"
                  )}
                >
                  <Poster
                    posterPath={null}
                    fallbackSrc={row.posterUrl ?? null}
                    title={row.title}
                    className="w-8 shrink-0"
                    sizes="32px"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{row.title}</span>
                </button>

                {row.tier ? (
                  <>
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-background"
                      style={{ backgroundColor: tierColorVar(row.tier) }}
                    >
                      {row.tier}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
                  </>
                ) : (
                  onRate && (
                    // No tier of the creator's own, so there is nothing to compare
                    // a guest against until they give one here.
                    <span className="flex shrink-0 gap-0.5" role="group" aria-label={`Rate “${row.title}”`}>
                      {TIERS.map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => onRate(row.id, tier)}
                          aria-label={`${row.title}: ${tier}`}
                          className="flex h-7 w-6 items-center justify-center rounded border border-border text-[11px] font-bold text-muted transition-colors hover:text-foreground"
                        >
                          {tier}
                        </button>
                      ))}
                    </span>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
