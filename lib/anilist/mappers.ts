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

const CYRILLIC = /[а-яё]/i;

/**
 * Letters that exist in other Cyrillic alphabets but not in Russian.
 *
 * "Cyrillic" alone is not the same as "Russian": AniList's synonym lists carry
 * Ukrainian, Bulgarian and Serbian names too, and a naive Cyrillic test picked
 * "Сталевий алхімік" over the Russian title for Fullmetal Alchemist. Ukrainian
 * і/ї/є/ґ, Belarusian ў and the Serbian ђ/ћ/њ/љ/џ/ј are the giveaways.
 */
const NON_RUSSIAN_CYRILLIC = /[іїєґўђћњљџѕјѐѝ]/i;

/**
 * AniList has no Russian title field — `title` carries only romaji, english and
 * native (Japanese). Community-submitted Russian names do live in `synonyms`
 * though ("Атака титанов" for Attack on Titan, verified), so the first Cyrillic
 * synonym is the closest thing to an official localisation the API offers.
 *
 * Only entries that are mostly Cyrillic qualify: a synonym list also holds
 * transliterations and stray punctuation, and a string with one Russian letter
 * in it is not a Russian title.
 */
function russianSynonym(synonyms: string[] | undefined): string | null {
  for (const value of synonyms ?? []) {
    if (NON_RUSSIAN_CYRILLIC.test(value)) continue;
    const letters = value.replace(/[^\p{L}]/gu, "");
    if (!letters) continue;
    const cyrillic = letters.match(/[а-яё]/gi)?.length ?? 0;
    if (CYRILLIC.test(value) && cyrillic / letters.length > 0.6) return value;
  }
  return null;
}

function pickTitle(raw: AniListMedia): string {
  return (
    russianSynonym(raw.synonyms) ??
    raw.title.english ??
    raw.title.romaji ??
    raw.title.native ??
    "Untitled"
  );
}

export function mapMediaToSummary(raw: AniListMedia): AnimeSummary {
  const russian = russianSynonym(raw.synonyms);
  return {
    anilistId: raw.id,
    title: pickTitle(raw),
    titles: {
      romaji: raw.title.romaji,
      // Keeps the English name reachable as the secondary line even when the
      // Russian one has taken the headline.
      english: raw.title.english ?? (russian ? raw.title.romaji : null),
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

export function mapMediaToDetails(raw: AniListMedia): AnimeDetails {
  return {
    ...mapMediaToSummary(raw),
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
