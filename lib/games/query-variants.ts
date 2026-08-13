/**
 * Turns a user's query into the list of terms worth asking Steam for.
 *
 * Steam's search matches the store's localized titles, so a Russian query
 * sometimes works on its own ("ведьмак" → «Ведьмак 3: Дикая Охота», verified)
 * and sometimes returns nothing ("елден ринг", "кс го"). Dropping the original
 * in favour of a translation would lose the first case, so every variant is
 * searched and the results merged — the original always goes first.
 */

const CYRILLIC = /[а-яё]/i;

/**
 * Names whose Russian spelling transliterates to something Steam has never
 * heard of ("майнкрафт" → "maynkraft"), or which are known by an abbreviation.
 * Longest keys are applied first so "кс го" wins over a bare "кс".
 */
const ALIASES: Record<string, string> = {
  "мир танков": "world of tanks",
  "побег из таркова": "escape from tarkov",
  "элден ринг": "elden ring",
  "елден ринг": "elden ring",
  "дарк соулс": "dark souls",
  "халф лайф": "half-life",
  "кс го": "counter-strike",
  "кс 2": "counter-strike 2",
  ксго: "counter-strike",
  контра: "counter-strike",
  кс: "counter-strike",
  гта: "gta",
  майнкрафт: "minecraft",
  ведьмак: "witcher",
  тарков: "escape from tarkov",
  сталкер: "stalker",
  киберпанк: "cyberpunk",
  скайрим: "skyrim",
  фоллаут: "fallout",
  фолаут: "fallout",
  варкрафт: "warcraft",
  старкрафт: "starcraft",
  варфрейм: "warframe",
  субнаутика: "subnautica",
  террария: "terraria",
  геншин: "genshin impact",
  пубг: "pubg",
  раст: "rust",
  танки: "world of tanks",
  портал: "portal",
  метро: "metro",
  дота: "dota",
};

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

/** Replaces every known alias found in the query, longest phrase first. */
export function applyAliases(value: string): string {
  let out = value.toLowerCase();
  const keys = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    // Word boundaries via lookaround so "кс" doesn't fire inside "риск".
    const pattern = new RegExp(`(^|[^а-яё])${key}(?![а-яё])`, "gi");
    out = out.replace(pattern, (_m, prefix: string) => `${prefix}${ALIASES[key]}`);
  }
  return out.trim();
}

/**
 * Ordered, de-duplicated terms to search. Latin queries pass through
 * untouched — there is nothing to gain from transliterating them.
 */
export function expandQueryVariants(query: string): string[] {
  const original = query.trim().replace(/\s+/g, " ");
  if (!original) return [];
  if (!hasCyrillic(original)) return [original];

  const variants = [original];
  const aliased = applyAliases(original);
  if (aliased && aliased !== original.toLowerCase()) variants.push(aliased);

  // Transliterate whatever the alias pass left in Cyrillic ("дота 2" → "dota 2").
  const translit = transliterate(aliased || original).trim();
  if (translit && !variants.some((v) => v.toLowerCase() === translit)) variants.push(translit);

  return variants;
}
