import type { AnimeDetails, AnimeSeason, AnimeStatus, AnimeSummary } from "@/lib/types/anime";
import type { AniListMedia } from "@/lib/anilist/types";

/**
 * AniList's `description(asHtml: false)` still leaves stray `<br>`/`<i>` tags
 * in some entries (a known API quirk, confirmed empirically) — strip them
 * here rather than trusting the flag.
 */
function stripHtml(value: string | null): string {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .trim();
}

/**
 * The headline, in the order a reader of an English site wants it.
 *
 * AniList also carries community-submitted Russian names in `synonyms`, and
 * this used to prefer them. It no longer does: the catalogue reads in English
 * now, so a Russian headline on an English page was the odd one out. The
 * synonyms still earn their keep — AniList matches against them, which is what
 * lets a Russian query find a title the site then names in English.
 */
function pickTitle(raw: AniListMedia): string {
  return raw.title.english ?? raw.title.romaji ?? raw.title.native ?? "Untitled";
}

export function mapMediaToSummary(raw: AniListMedia): AnimeSummary {
  return {
    anilistId: raw.id,
    title: pickTitle(raw),
    titles: {
      romaji: raw.title.romaji,
      english: raw.title.english,
      native: raw.title.native,
    },
    coverImage: raw.coverImage?.large ?? raw.coverImage?.medium ?? null,
    bannerImage: raw.bannerImage,
    description: stripHtml(raw.description),
    year: raw.seasonYear ?? raw.startDate?.year ?? null,
    season: (raw.season as AnimeSeason | null) ?? null,
    episodes: raw.episodes,
    duration: raw.duration,
    status: (raw.status as AnimeStatus | null) ?? null,
    genres: raw.genres ?? [],
    score: raw.averageScore !== null ? Math.round(raw.averageScore) / 10 : null,
    favourites: raw.favourites,
    studios: raw.studios?.nodes.map((s) => s.name) ?? [],
    format: raw.format,
  };
}

/**
 * How many people actually scored the entry.
 *
 * AniList exposes no such field directly — `popularity` counts everyone with
 * the show on a list, scored or not, and `favourites` counts a different thing
 * again. Summing the score histogram is the one honest answer available.
 */
function scoredBy(raw: AniListMedia): number | null {
  const buckets = raw.stats?.scoreDistribution;
  if (!buckets?.length) return null;
  const total = buckets.reduce((sum, bucket) => sum + (bucket.amount ?? 0), 0);
  return total > 0 ? total : null;
}

export function mapMediaToDetails(raw: AniListMedia): AnimeDetails {
  const scored = scoredBy(raw);
  return {
    ...mapMediaToSummary(raw),
    ...(scored !== null ? { scoredBy: scored } : {}),
    source: raw.source,
    relations: (raw.relations?.edges ?? [])
      .filter((edge) => edge.node.type === "ANIME")
      .map((edge) => ({
        anilistId: edge.node.id,
        title: edge.node.title.romaji ?? "Untitled",
        relationType: edge.relationType,
        coverImage: edge.node.coverImage?.medium ?? null,
        format: edge.node.format,
      })),
  };
}
