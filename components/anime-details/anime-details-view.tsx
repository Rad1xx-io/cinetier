"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Plus, Star, Trash2 } from "lucide-react";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { Poster } from "@/components/movie-card/poster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CriteriaSection } from "@/components/criteria/criteria-section";
import type { TierOrUnrated } from "@/lib/types";
import { TIER_ORDER } from "@/lib/types";
import type { AnimeDetails } from "@/lib/types/anime";
import { formatEpisodes, formatScore, seasonLabel, statusLabel } from "@/lib/utils/anime-format";
import { tierColorVar, tierLabel } from "@/lib/utils/tier-style";
import { cn } from "@/lib/utils/cn";
import { trackItemAdded, trackItemRanked } from "@/lib/analytics/events";

export function AnimeDetailsView({ details }: { details: AnimeDetails }) {
  const { titles, add, remove, setTier, hydrated } = useRankedTitles();

  const ranked = titles.find((t) => t.tmdbId === details.anilistId && t.mediaType === "anime");
  const releaseDate = details.year ? `${details.year}-01-01` : null;

  function handleAdd() {
    trackItemAdded(`anime-${details.anilistId}`, "anime", "details");
    add({
      tmdbId: details.anilistId,
      mediaType: "anime",
      title: details.title,
      posterPath: details.coverImage,
      releaseDate,
      voteAverage: details.score ?? undefined,
    });
  }

  function handleTierChange(tier: TierOrUnrated) {
    trackItemRanked(`anime-${details.anilistId}`, tier, ranked?.tier);
    if (!ranked) {
      add({
        tmdbId: details.anilistId,
        mediaType: "anime",
        title: details.title,
        posterPath: details.coverImage,
        releaseDate,
        voteAverage: details.score ?? undefined,
        tier,
      });
    } else {
      setTier(details.anilistId, "anime", tier);
    }
  }

  const altTitle = [details.titles.romaji, details.titles.native].find(
    (t) => t && t !== details.title
  );

  return (
    <div>
      <div className="relative h-56 w-full overflow-hidden bg-surface-raised sm:h-72 md:h-96">
        {details.bannerImage ? (
          <Image src={details.bannerImage} alt="" fill priority className="object-cover" sizes="100vw" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-surface-raised to-surface" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <Link
          href="/anime"
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-background/70 backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:left-6"
          aria-label="Назад к поиску"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="mx-auto -mt-20 max-w-5xl px-4 pb-16 sm:-mt-24 md:px-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <Poster
            posterPath={details.coverImage}
            title={details.title}
            size="w500"
            priority
            className="w-36 shrink-0 shadow-2xl sm:w-48"
            sizes="(max-width: 640px) 144px, 192px"
          />

          <div className="min-w-0 flex-1 pt-2 sm:pt-12">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {details.year && <span>{details.year}</span>}
              {seasonLabel(details.season) && <span>{seasonLabel(details.season)}</span>}
              <span>{formatEpisodes(details.episodes)}</span>
              {details.duration && <span>{details.duration} мин/эп</span>}
              {statusLabel(details.status) && <Badge variant="outline">{statusLabel(details.status)}</Badge>}
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-hidden />
                {formatScore(details.score)}
              </span>
            </div>

            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{details.title}</h1>
            {altTitle && <p className="mt-0.5 text-sm text-muted">{altTitle}</p>}
            {details.studios.length > 0 && (
              <p className="mt-1 text-sm text-muted">{details.studios.join(", ")}</p>
            )}

            {details.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {details.genres.map((g) => (
                  <Badge key={g}>{g}</Badge>
                ))}
              </div>
            )}

            <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {details.description || "Описание отсутствует."}
            </p>

            {details.source && (
              <p className="mt-3 text-xs text-muted">
                Первоисточник: <span className="text-foreground">{details.source}</span>
              </p>
            )}

            <div className="mt-6 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Статус:{" "}
                <span className="text-foreground">
                  {!hydrated ? "…" : !ranked ? "Не добавлено" : `Ваш тир — ${tierLabel(ranked.tier)}`}
                </span>
              </p>

              {!ranked ? (
                <Button onClick={handleAdd} disabled={!hydrated}>
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
                            active ? "border-transparent text-background" : "border-border text-muted hover:text-foreground"
                          )}
                          style={active ? { backgroundColor: isUnrated ? "var(--muted)" : tierColorVar(tier) } : undefined}
                        >
                          {isUnrated ? "—" : tier}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => remove(details.anilistId, "anime")}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Удалить
                  </Button>
                </div>
              )}

              <CriteriaSection
                tmdbId={details.anilistId}
                mediaType={"anime"}
                isRanked={Boolean(ranked)}
                criteriaScores={ranked?.criteriaScores}
              />
            </div>

            {details.relations.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-sm font-semibold">Связанные тайтлы</h2>
                <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
                  {details.relations.slice(0, 12).map((rel) => (
                    <Link
                      key={rel.anilistId}
                      href={`/anime/${rel.anilistId}`}
                      className="flex w-24 shrink-0 flex-col gap-1.5"
                    >
                      <Poster posterPath={rel.coverImage} title={rel.title} sizes="96px" />
                      <p className="line-clamp-2 break-words text-[11px] leading-tight text-muted">{rel.title}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
