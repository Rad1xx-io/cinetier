"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks, TriangleAlert } from "lucide-react";
import { Poster } from "@/components/movie-card/poster";
import { ChannelThumbnail } from "@/components/channel-card/channel-thumbnail";
import { ContentTypeBadge } from "@/components/ui/content-type-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TIER_ORDER } from "@/lib/types";
import type { RankedTitle, TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import { TIER_META } from "@/lib/tier-meta";
import { tierColorVar } from "@/lib/utils/tier-style";
import { getPublicTierList, type PublicTierList } from "@/lib/supabase/profiles";
import { titlesCountLabel } from "@/lib/utils/pluralize-ru";
import { criteriaAverage, type CriterionScore } from "@/lib/types/criteria";
import { trackSharedContentViewed } from "@/lib/analytics/events";
import { ForkButton } from "@/components/public-tier-list/fork-button";
import { DonateButton } from "@/components/profile/donate-button";

/** One criterion per line, for the badge's native tooltip. */
function criteriaTooltip(scores: CriterionScore[] | undefined): string {
  return (scores ?? []).map((c) => `${c.name}: ${c.score.toFixed(1)}`).join("\n");
}
import { CATEGORY_FILTERS, type CategoryFilter } from "@/lib/utils/content-type";
import { cn } from "@/lib/utils/cn";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; data: PublicTierList };

export function PublicTierListView({ username }: { username: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [category, setCategory] = useState<CategoryFilter>("all");

  useEffect(() => {
    let cancelled = false;
    getPublicTierList(username)
      .then((data) => {
        if (cancelled) return;
        setState(data ? { status: "ready", data } : { status: "missing" });
        // Reported on a successful load rather than on mount: a view of a list
        // that turned out not to exist is not a view of shared content.
        if (data) trackSharedContentViewed("tier_list", data.profile.username, data.profile.id);
      })
      .catch(() => {
        if (!cancelled) setState({ status: "missing" });
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-[1600px] space-y-3 px-4 py-8 md:px-6">
        <Skeleton className="h-9 w-56" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <TriangleAlert className="h-10 w-10 text-muted" aria-hidden />
        <h1 className="text-lg font-semibold">Тир-лист не найден</h1>
        <p className="text-sm text-muted">
          Пользователя <span className="text-foreground">@{username}</span> не существует, либо его
          список закрыт.
        </p>
        <Button asChild variant="secondary">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    );
  }

  const { profile, titles, channels } = state.data;
  const displayName = profile.displayName || `@${profile.username}`;

  // Channels live outside RankedTitle and have no mediaType, so "youtube" is a
  // category of its own here rather than another value of the title filter.
  const visibleTitles = category === "all" || category === "youtube"
    ? category === "youtube" ? [] : titles
    : titles.filter((t) => t.mediaType === category);
  const visibleChannels = category === "all" || category === "youtube" ? channels : [];

  const total = titles.length + channels.length;
  const shown = visibleTitles.length + visibleChannels.length;

  // Offering a category that this particular list has nothing in would be a
  // dead button, so the row only advertises what is actually here.
  const availableFilters = CATEGORY_FILTERS.filter((f) => {
    if (f.value === "all") return true;
    if (f.value === "youtube") return channels.length > 0;
    return titles.some((t) => t.mediaType === f.value);
  });

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Тир-лист пользователя</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{displayName}</h1>
          <p className="mt-1 text-sm text-muted">
            @{profile.username} · {titlesCountLabel(total)}
            {category !== "all" && ` · показано ${shown}`}
          </p>
        </div>
        <ForkButton profile={profile} sourceTitles={titles} sourceChannels={channels} />
      </header>

      {availableFilters.length > 2 && (
        <div
          className="mb-5 flex flex-wrap gap-1 rounded-lg border border-border p-0.5"
          role="group"
          aria-label="Категория"
        >
          {availableFilters.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCategory(opt.value)}
              aria-pressed={category === opt.value}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                category === opt.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {TIER_ORDER.map((tier) => (
          <ReadOnlyTierRow
            key={tier}
            tier={tier}
            titles={visibleTitles.filter((t) => t.tier === tier).sort((a, b) => a.order - b.order)}
            channels={visibleChannels.filter((c) => c.tier === tier).sort((a, b) => a.order - b.order)}
          />
        ))}
      </div>

      {/* Under the board rather than beside the title: asking before someone
          has seen the work is asking too early, and this is the point where
          they have just finished reading it. */}
      <DonateButton
        authorId={profile.id}
        authorName={displayName}
        donationUrl={profile.donationUrl}
        variant="card"
        className="mt-10"
      />

      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-8 text-center">
        <ListChecks className="h-8 w-8 text-accent" aria-hidden />
        <p className="text-sm text-muted">Соберите свой тир-лист фильмов, аниме, игр и каналов.</p>
        <Button asChild size="sm">
          <Link href="/">Начать в TierListOnline</Link>
        </Button>
      </div>
    </div>
  );
}

/** The same row shape as the editable board, minus every control. */
function ReadOnlyTierRow({
  tier,
  titles,
  channels,
}: {
  tier: TierOrUnrated;
  titles: RankedTitle[];
  channels: RankedChannel[];
}) {
  const isUnrated = tier === "Unrated";
  const meta = TIER_META[tier];
  const count = titles.length + channels.length;

  // An empty "не оценено" row is noise on someone else's list.
  if (isUnrated && count === 0) return null;

  return (
    <div className="flex rounded-xl border border-border bg-surface">
      <div
        className="flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-l-xl px-1.5 py-3 text-center sm:w-24 md:w-28"
        style={{
          backgroundColor: isUnrated ? "var(--surface-raised)" : tierColorVar(tier),
          color: isUnrated ? "var(--muted)" : "var(--background)",
        }}
      >
        <span className="text-lg font-bold sm:text-2xl" aria-hidden>
          {isUnrated ? "—" : tier}
        </span>
        <span className="line-clamp-2 break-words text-[10px] font-medium leading-tight sm:text-xs">
          {meta.name}
        </span>
        <span className="text-[10px] opacity-80">{titlesCountLabel(count)}</span>
      </div>

      <div className="flex min-h-28 flex-1 flex-wrap content-start items-start gap-3 p-3 sm:min-h-32">
        {count === 0 && <p className="flex h-24 items-center px-2 text-xs text-muted">Пусто</p>}

        {titles.map((t) => {
          const average = criteriaAverage(t.criteriaScores);
          return (
            <div key={`${t.mediaType}-${t.tmdbId}`} className="w-20 shrink-0 sm:w-24">
              <div className="relative">
                <Poster posterPath={t.posterPath} title={t.title} sizes="96px" />
                {average !== null && (
                  <span
                    className="absolute right-1 top-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-bold text-accent backdrop-blur"
                    // A tier row has no room for the chips themselves, so the
                    // breakdown they would show rides along as a tooltip.
                    title={criteriaTooltip(t.criteriaScores)}
                  >
                    {average.toFixed(1)}
                  </span>
                )}
              </div>
              <p className="mt-1.5 line-clamp-1 break-words text-[11px] font-medium" title={t.title}>
                {t.title}
              </p>
              <ContentTypeBadge type={t.mediaType} className="mt-0.5" />
            </div>
          );
        })}

        {channels.map((c) => (
          <div key={c.channelId} className="w-20 shrink-0 sm:w-24">
            <ChannelThumbnail thumbnailUrl={c.thumbnailUrl} title={c.title} sizes="96px" />
            <p className="mt-1.5 line-clamp-1 break-words text-[11px] font-medium" title={c.title}>
              {c.title}
            </p>
            <ContentTypeBadge type="youtube" className="mt-0.5" />
          </div>
        ))}
      </div>
    </div>
  );
}
