"use client";

import Image from "next/image";
import { ArrowLeft, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { Poster } from "@/components/movie-card/poster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CriteriaSection } from "@/components/criteria/criteria-section";
import { AffiliateLinks } from "@/components/media/affiliate-links";
import type { TierOrUnrated, TitleDetails } from "@/lib/types";
import { TIER_ORDER } from "@/lib/types";
import { backdropUrl } from "@/lib/utils/tmdb-image";
import { formatRating, mediaTypeLabel, releaseYear } from "@/lib/utils/format";
import { tierColorVar, tierLabel } from "@/lib/utils/tier-style";
import { pluralizeRu } from "@/lib/utils/pluralize-ru";
import { cn } from "@/lib/utils/cn";
import { trackItemAdded, trackItemRanked } from "@/lib/analytics/events";

export function TitleDetailsView({
  details,
  watchLinks,
}: {
  details: TitleDetails;
  /** Availability from TMDB, resolved on the server. */
  watchLinks?: Record<string, string>;
}) {
  const { titles, add, remove, setTier, hydrated } = useRankedTitles();

  const ranked = titles.find(
    (t) => t.tmdbId === details.tmdbId && t.mediaType === details.mediaType
  );
  const backdrop = backdropUrl(details.backdropPath);

  function handleAdd() {
    trackItemAdded(`${details.mediaType}-${details.tmdbId}`, details.mediaType, "details");
    add({
      tmdbId: details.tmdbId,
      mediaType: details.mediaType,
      title: details.title,
      posterPath: details.posterPath,
      releaseDate: details.releaseDate,
    });
  }

  function handleTierChange(tier: TierOrUnrated) {
    trackItemRanked(`${details.mediaType}-${details.tmdbId}`, tier, ranked?.tier);
    if (!ranked) {
      add({
        tmdbId: details.tmdbId,
        mediaType: details.mediaType,
        title: details.title,
        posterPath: details.posterPath,
        releaseDate: details.releaseDate,
        tier,
      });
    } else {
      setTier(details.tmdbId, details.mediaType, tier);
    }
  }

  return (
    <div>
      <div className="relative h-56 w-full overflow-hidden sm:h-72 md:h-96">
        {backdrop ? (
          <Image src={backdrop} alt="" fill priority className="object-cover" sizes="100vw" />
        ) : (
          <div className="h-full w-full bg-surface-raised" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <Link
          href="/discover"
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
            title={details.title}
            size="w500"
            priority
            className="w-36 shrink-0 shadow-2xl sm:w-48"
            sizes="(max-width: 640px) 144px, 192px"
          />

          <div className="flex-1 pt-2 sm:pt-12">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge variant="outline">{mediaTypeLabel(details.mediaType)}</Badge>
              <span>{releaseYear(details.releaseDate)}</span>
              {details.runtime ? <span>{details.runtime} мин</span> : null}
              {details.numberOfSeasons ? (
                <span>
                  {details.numberOfSeasons}{" "}
                  {pluralizeRu(details.numberOfSeasons, "сезон", "сезона", "сезонов")}
                </span>
              ) : null}
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-hidden />
                {formatRating(details.voteAverage)}
              </span>
            </div>

            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{details.title}</h1>
            {details.originalTitle !== details.title && (
              <p className="mt-0.5 text-sm text-muted">Оригинальное название: {details.originalTitle}</p>
            )}

            {details.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {details.genres.map((g) => (
                  <Badge key={g.id}>{g.name}</Badge>
                ))}
              </div>
            )}

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/90">
              {details.overview || "Описание отсутствует."}
            </p>

            <div className="mt-6 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Статус:{" "}
                <span className="text-foreground">
                  {!hydrated ? "…" : !ranked ? "Не добавлено" : tierLabel(ranked.tier)}
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
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => remove(details.tmdbId, details.mediaType)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Удалить
                  </Button>
                </div>
              )}

              <CriteriaSection
                tmdbId={details.tmdbId}
                mediaType={details.mediaType}
                isRanked={Boolean(ranked)}
                criteriaScores={ranked?.criteriaScores}
              />

              {/* Stored links win over the ones derived from TMDB: a real
                  partner deep link is a better destination than a search, and
                  is the only kind that can carry a commission. */}
              <AffiliateLinks
                titleId={`${details.mediaType}-${details.tmdbId}`}
                titleName={details.title}
                links={{ ...watchLinks, ...ranked?.affiliateLinks }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
