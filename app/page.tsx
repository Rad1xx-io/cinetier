"use client";

import Link from "next/link";
import { History, PlusCircle, Sparkles, ListPlus } from "lucide-react";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { TitleShelf } from "@/components/dashboard/title-shelf";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Hero } from "@/components/dashboard/hero";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { titles, hydrated, storageAvailable } = useRankedTitles();

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  if (!storageAvailable) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-muted">
          Локальное хранилище недоступно в этом браузере, поэтому CineTier не может сохранить
          здесь ваши рейтинги. Попробуйте другой браузер или отключите режим инкогнито.
        </p>
      </div>
    );
  }

  if (titles.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 md:px-6">
        <Hero />
        <EmptyState />
      </div>
    );
  }

  const recentlyAdded = [...titles].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);

  const recentlyRated = [...titles]
    .filter((t) => t.tier !== "Unrated")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);

  const topSTier = [...titles]
    .filter((t) => t.tier === "S")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);

  const continueRanking = titles
    .filter((t) => t.tier === "Unrated")
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 12);

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            My Cine<span className="text-accent">Tier</span>
          </h1>
          <p className="mt-1 text-sm text-muted">Ваш личный рейтинг фильмов и сериалов.</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/tier-list">
            <ListPlus className="h-4 w-4" aria-hidden />
            Открыть тир-лист
          </Link>
        </Button>
      </div>

      <StatsGrid titles={titles} />

      {continueRanking.length > 0 && (
        <TitleShelf
          title="Продолжить оценивать"
          icon={<ListPlus className="h-4 w-4 text-accent" aria-hidden />}
          titles={continueRanking}
          emptyLabel="Оценивать больше нечего — отличная работа."
        />
      )}

      <TitleShelf
        title="Недавно добавленные"
        icon={<PlusCircle className="h-4 w-4 text-accent" aria-hidden />}
        titles={recentlyAdded}
        emptyLabel="Добавьте что-нибудь через Поиск."
      />

      <TitleShelf
        title="Недавно оценённые"
        icon={<History className="h-4 w-4 text-accent" aria-hidden />}
        titles={recentlyRated}
        emptyLabel="Оцените тайтл, чтобы увидеть его здесь."
      />

      <TitleShelf
        title="Топ S-тира"
        icon={<Sparkles className="h-4 w-4 text-accent" aria-hidden />}
        titles={topSTier}
        emptyLabel="Тайтлы из S-тира появятся здесь."
      />
    </div>
  );
}
