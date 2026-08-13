import { distance } from "fastest-levenshtein";
import { SEARCH_ALIASES } from "@/lib/search/aliases";

const CYRILLIC = /[а-яё]/i;

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function hasCyrillic(value: string): boolean {
  return CYRILLIC.test(value);
}

export function transliterate(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("");
}

const ALIAS_KEYS = Object.keys(SEARCH_ALIASES).sort((a, b) => b.length - a.length);

/**
 * How far a typo may stray before the match stops being believable.
 *
 * Scaled by length because one wrong letter in a three-letter word is a
 * different word, while one in a twelve-letter one is a slip of the finger.
 * Anything looser starts "correcting" real titles into unrelated ones.
 */
function tolerance(length: number): number {
  if (length <= 4) return 0;
  if (length <= 7) return 1;
  if (length <= 12) return 2;
  return 3;
}

/** The alias key closest to `token`, or null when nothing is near enough. */
function nearestAlias(token: string): string | null {
  if (SEARCH_ALIASES[token]) return token;

  const limit = tolerance(token.length);
  if (limit === 0) return null;

  let best: string | null = null;
  let bestDistance = Infinity;

  for (const key of ALIAS_KEYS) {
    // Comparing wildly different lengths wastes work and never wins.
    if (Math.abs(key.length - token.length) > limit) continue;
    const d = distance(token, key);
    if (d < bestDistance) {
      bestDistance = d;
      best = key;
    }
  }

  return bestDistance <= limit ? best : null;
}

/**
 * Replaces known names, tolerating typos.
 *
 * Whole phrases are tried before single words so "кс го" is not first mangled
 * into two separate lookups.
 */
function applyAliases(value: string): { text: string; changed: boolean } {
  const lower = value.toLowerCase().trim();

  const phrase = nearestAlias(lower);
  if (phrase) return { text: SEARCH_ALIASES[phrase], changed: true };

  let changed = false;
  const words = lower.split(/\s+/).map((word) => {
    const key = nearestAlias(word);
    if (!key) return word;
    changed = true;
    return SEARCH_ALIASES[key];
  });

  return { text: words.join(" "), changed };
}

export interface NormalizedQuery {
  /** Exactly what was typed, trimmed. Always searched first. */
  original: string;
  /**
   * A genuine correction worth telling the user about — a typo mended or an
   * abbreviation expanded. Transliteration is deliberately excluded: "наруто"
   * is not a mistake, so answering it with "возможно, вы искали naruto" would
   * be correcting someone who typed exactly what they meant.
   */
  corrected: string | null;
  /** Ordered, de-duplicated terms: the original, then anything else to try. */
  variants: string[];
}

/**
 * Works out what else a query might have meant.
 *
 * The original is never replaced, only supplemented: "ведьмак" genuinely finds
 * the Witcher on TMDB and AniList, and swapping it for "witcher" would trade a
 * working search for a guess. Callers run the original first and only reach for
 * the rest when it comes back with too little.
 */
export function normalizeQuery(raw: string): NormalizedQuery {
  const original = raw.trim().replace(/\s+/g, " ");
  if (!original) return { original: "", corrected: null, variants: [] };

  const variants = [original];
  const { text: aliased, changed } = applyAliases(original);

  let corrected: string | null = null;
  if (changed && aliased && aliased !== original.toLowerCase()) {
    variants.push(aliased);
    // An alias that merely spells the same word in Latin ("наруто" -> "naruto")
    // is a translation, not a fix. Telling someone who typed their query
    // correctly that they may have meant something else is worse than silence,
    // so only a result the transliteration could not have produced counts.
    if (aliased !== transliterate(original).trim()) corrected = aliased;
  }

  // Whatever is still in Cyrillic gets a transliterated attempt too ("дота 2"
  // is not in the map as a phrase, but becomes "dota 2"). It joins the search
  // variants without being reported as a correction.
  if (hasCyrillic(aliased || original)) {
    const translit = transliterate(aliased || original).trim();
    if (translit && !variants.some((v) => v.toLowerCase() === translit)) {
      variants.push(translit);
    }
  }

  return { original, corrected, variants };
}
