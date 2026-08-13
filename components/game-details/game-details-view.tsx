"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Plus, Star, Trash2 } from "lucide-react";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { Poster } from "@/components/movie-card/poster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TierOrUnrated } from "@/lib/types";
import { TIER_ORDER } from "@/lib/types";
import type { GameDetails } from "@/lib/types/game";
import { releaseYear } from "@/lib/utils/format";
import { tierColorVar, tierLabel } from "@/lib/utils/tier-style";
import { cn } from "@/lib/utils/cn";

export function GameDetailsView({ details }: { details: GameDetails }) {
  const { titles, add, remove, setTier, hydrated } = useRankedTitles();

  const ranked = titles.find((t) => t.tmdbId === details.appId && t.mediaType === "game");

  function addInput(tier?: TierOrUnrated) {
    return {
      tmdbId: details.appId,
      mediaType: "game" as const,
      title: details.title,
      posterPath: details.posterPath,
      releaseDate: details.releaseDate,
      voteAverage: details.score ?? undefined,
      ...(tier ? { tier } : {}),
    };
  }

  function handleTierChange(tier: TierOrUnrated) {
    if (!ranked) add(addInput(tier));
    else setTier(details.appId, "game", tier);
  }

  return (
    <div>
      <div className="relative h-56 w-full overflow-hidden bg-surface-raised sm:h-72 md:h-96">
        {details.headerImage ? (
          <Image src={details.headerImage} alt="" fill priority className="object-cover" sizes="100vw" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-surface-raised to-surface" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <Link
          href="/games"
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-background/70 backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:left-6"
          aria-label="Назад к поиску"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="mx-auto -mt-20 max-w-5xl px-4 pb-16 sm:-mt-24 md:px-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <Poster
            posterPath={details.posterPath}
            fallbackSrc={details.fallbackImage}
            title={details.title}
            size="w500"
            priority
            className="w-36 shrink-0 shadow-2xl sm:w-48"
            sizes="(max-width: 640px) 144px, 192px"
          />

          <div className="min-w-0 flex-1 pt-2 sm:pt-12">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{releaseYear(details.releaseDate)}</span>
              {details.score !== null && (
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-hidden />
                  {details.score.toFixed(1)}
                </span>
              )}
              {details.platforms.length > 0 && <span>{details.platforms.join(" · ")}</span>}
              <Badge variant="outline">{details.isFree ? "Бесплатно" : details.price ?? "—"}</Badge>
            </div>

            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{details.title}</h1>
            {details.developers.length > 0 && (
              <p className="mt-1 text-sm text-muted">{details.developers.join(", ")}</p>
            )}

            {details.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {details.genres.map((g) => (
                  <Badge key={g}>{g}</Badge>
                ))}
              </div>
            )}

            <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {details.shortDescription || "Описание отсутствует."}
            </p>

            <a
              href={`https://store.steampowered.com/app/${details.appId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-muted hover:text-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Открыть в Steam
            </a>

            <div className="mt-6 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Статус:{" "}
                <span className="text-foreground">
                  {!hydrated ? "…" : !ranked ? "Не добавлено" : `Ваш тир — ${tierLabel(ranked.tier)}`}
                </span>
              </p>

              {!ranked ? (
                <Button onClick={() => add(addInput())} disabled={!hydrated}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Добавить в список
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Изменить тир">
                    {TIER_ORDER.map((tier) => {
                      const active = ranked.tier === tier;
                      const isUnrated = tier === "Unrated";
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => handleTierChange(tier)}
                          aria-pressed={active}
                          className={cn(
                            "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                            active
                              ? "border-transparent text-background"
                              : "border-border text-muted hover:text-foreground"
                          )}
                          style={
                            active
                              ? { backgroundColor: isUnrated ? "var(--muted)" : tierColorVar(tier) }
                              : undefined
                          }
                        >
                          {isUnrated ? "—" : tier}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => remove(details.appId, "game")}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Удалить
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
