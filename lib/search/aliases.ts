/**
 * Russian names and abbreviations the upstream catalogs do not index.
 *
 * Some Russian queries work unaided — TMDB localises its titles, and AniList
 * carries community-submitted Russian names in its synonym list, so "ведьмак"
 * and "атака титанов" already find their targets. These are the ones that do
 * not: an abbreviation no catalog knows ("кс"), or a name whose transliteration
 * lands nowhere ("майнкрафт" becomes "maynkraft").
 *
 * Longest keys are applied first so "кс го" wins over a bare "кс".
 */
export const SEARCH_ALIASES: Record<string, string> = {
  // Games
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
  ведьмак: "witcher",

  // Anime — AniList finds most Russian names through its synonyms, so these are
  // the ones written the way people say them rather than the way they are listed.
  ванпанчмен: "one punch man",
  "ван панч мен": "one punch man",
  "ванпанч мен": "one punch man",
  "клинок рассекающий демонов": "demon slayer",
  "магическая битва": "jujutsu kaisen",
  "человек бензопила": "chainsaw man",
  "тетрадь смерти": "death note",
  "血 хантер": "hunter x hunter",
  "охотник х охотник": "hunter x hunter",
  "стальной алхимик": "fullmetal alchemist",
  "унесённые призраками": "spirited away",
  "истребитель демонов": "demon slayer",
  евангелион: "evangelion",
  берсерк: "berserk",
  блич: "bleach",
  наруто: "naruto",
  "ван пис": "one piece",
  ванпис: "one piece",
  "токийский гуль": "tokyo ghoul",
  "моя геройская академия": "my hero academia",
  "врата штейна": "steins gate",
  "код гиас": "code geass",

  // Film and TV
  "звёздные войны": "star wars",
  "звездные войны": "star wars",
  "властелин колец": "lord of the rings",
  "игра престолов": "game of thrones",
  "во все тяжкие": "breaking bad",
  "очень странные дела": "stranger things",
  "гарри поттер": "harry potter",
  "мстители": "avengers",
  "интерстеллар": "interstellar",
  "начало": "inception",
  "матрица": "matrix",
};
