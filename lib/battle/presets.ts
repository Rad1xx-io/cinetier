import type { BattleCategory } from "@/lib/types/battle";

/**
 * Ready-made battle line-ups, for people whose own list is too short or too
 * personal to make a good round.
 *
 * These are curated data, not a catalog query. A themed set has to be stable —
 * a battle created today and played next month must contain the same items — and
 * "Топ игр 2024" from a live popularity endpoint would quietly become something
 * else. Editing this file is the intended way to add or fix a set.
 *
 * Each pool holds far more entries than one battle uses, so the same preset can
 * be rerolled into a different round. Ids follow the app's own scheme
 * (`movie-<tmdbId>`, `tv-<tmdbId>`, `game-<appId>`, `anime-<anilistId>`) so an
 * entry the creator already ranked can join to their tier — but see
 * `titlesMatch` below for why the id alone is not trusted to do it.
 */
export interface PresetItem {
  id: string;
  title: string;
}

export interface BattlePreset {
  slug: string;
  name: string;
  description: string;
  category: BattleCategory;
  items: PresetItem[];
}

export const BATTLE_PRESETS: BattlePreset[] = [
  {
    slug: "modern-classics",
    name: "Современная классика",
    description: "Фильмы, о которых спорят чаще всего.",
    category: "cinema",
    items: [
      { id: "movie-27205", title: "Начало" },
      { id: "movie-157336", title: "Интерстеллар" },
      { id: "movie-155", title: "Тёмный рыцарь" },
      { id: "movie-680", title: "Криминальное чтиво" },
      { id: "movie-550", title: "Бойцовский клуб" },
      { id: "movie-13", title: "Форрест Гамп" },
      { id: "movie-278", title: "Побег из Шоушенка" },
      { id: "movie-603", title: "Матрица" },
      { id: "movie-496243", title: "Паразиты" },
      { id: "movie-129", title: "Унесённые призраками" },
      { id: "movie-238", title: "Крёстный отец" },
      { id: "movie-240", title: "Крёстный отец 2" },
      { id: "movie-424", title: "Список Шиндлера" },
      { id: "movie-389", title: "12 разгневанных мужчин" },
      { id: "movie-769", title: "Славные парни" },
      { id: "movie-311", title: "Однажды в Америке" },
      { id: "movie-807", title: "Семь" },
      { id: "movie-274", title: "Молчание ягнят" },
      { id: "movie-1891", title: "Империя наносит ответный удар" },
      { id: "movie-11", title: "Звёздные войны" },
      { id: "movie-120", title: "Властелин колец: Братство кольца" },
      { id: "movie-122", title: "Властелин колец: Возвращение короля" },
      { id: "movie-539", title: "Психо" },
      { id: "movie-947", title: "Лоуренс Аравийский" },
      { id: "movie-599", title: "Сансет бульвар" },
      { id: "movie-289", title: "Касабланка" },
      { id: "movie-73", title: "Американская история X" },
      { id: "movie-1124", title: "Престиж" },
      { id: "movie-77", title: "Помни" },
      { id: "movie-641", title: "Реквием по мечте" },
      { id: "movie-4922", title: "Догвилль" },
      { id: "movie-475557", title: "Джокер" },
      { id: "movie-438631", title: "Дюна" },
      { id: "movie-335984", title: "Бегущий по лезвию 2049" },
      { id: "movie-329865", title: "Прибытие" },
      { id: "movie-693134", title: "Дюна: Часть вторая" },
      { id: "movie-872585", title: "Оппенгеймер" },
      { id: "movie-361743", title: "Топ Ган: Мэверик" },
      { id: "movie-545611", title: "Всё везде и сразу" },
      { id: "movie-530915", title: "1917" },
      { id: "movie-466272", title: "Однажды в Голливуде" },
      { id: "movie-324857", title: "Человек-паук: Через вселенные" },
    ],
  },
  {
    slug: "prestige-tv",
    name: "Великие сериалы",
    description: "Те, что кто-нибудь обязательно назовёт лучшим в истории.",
    category: "cinema",
    items: [
      { id: "tv-1396", title: "Во все тяжкие" },
      { id: "tv-1399", title: "Игра престолов" },
      { id: "tv-1398", title: "Клан Сопрано" },
      { id: "tv-60059", title: "Лучше звоните Солу" },
      { id: "tv-1438", title: "Прослушка" },
      { id: "tv-66732", title: "Очень странные дела" },
      { id: "tv-87108", title: "Чернобыль" },
      { id: "tv-76479", title: "Пацаны" },
      { id: "tv-94605", title: "Аркейн" },
      { id: "tv-71912", title: "Ведьмак" },
      { id: "tv-1668", title: "Друзья" },
      { id: "tv-1418", title: "Теория большого взрыва" },
      { id: "tv-2316", title: "Офис" },
      { id: "tv-1100", title: "Как я встретил вашу маму" },
      { id: "tv-4614", title: "Обмани меня" },
      { id: "tv-1416", title: "Анатомия страсти" },
      { id: "tv-1622", title: "Сверхъестественное" },
      { id: "tv-456", title: "Симпсоны" },
      { id: "tv-1434", title: "Гриффины" },
      { id: "tv-60625", title: "Рик и Морти" },
      { id: "tv-46648", title: "Настоящий детектив" },
      { id: "tv-1408", title: "Доктор Хаус" },
      { id: "tv-31917", title: "Милые обманщицы" },
      { id: "tv-63174", title: "Люцифер" },
      { id: "tv-62560", title: "Мистер Робот" },
      { id: "tv-1402", title: "Ходячие мертвецы" },
      { id: "tv-82856", title: "Мандалорец" },
      { id: "tv-85552", title: "Эйфория" },
      { id: "tv-60735", title: "Флэш" },
      { id: "tv-1429", title: "Атака титанов" },
      { id: "tv-70523", title: "Тёмные" },
      { id: "tv-95557", title: "Непобедимый" },
      { id: "tv-100088", title: "Одни из нас" },
      { id: "tv-119051", title: "Уэнсдей" },
      { id: "tv-84958", title: "Локи" },
      { id: "tv-95396", title: "Медленные лошади" },
      { id: "tv-136315", title: "Разделение" },
      { id: "tv-124364", title: "Из" },
      { id: "tv-92749", title: "Лунный рыцарь" },
      { id: "tv-90802", title: "Песочный человек" },
    ],
  },
  {
    slug: "anime-essentials",
    name: "Аниме, которое советуют всем",
    description: "Классический набор для спора о вкусах.",
    category: "anime",
    items: [
      { id: "anime-16498", title: "Атака титанов" },
      { id: "anime-1535", title: "Тетрадь смерти" },
      { id: "anime-5114", title: "Стальной алхимик: Братство" },
      { id: "anime-9253", title: "Врата Штейна" },
      { id: "anime-11061", title: "Хантер х Хантер" },
      { id: "anime-21", title: "Ван-Пис" },
      { id: "anime-20", title: "Наруто" },
      { id: "anime-101922", title: "Клинок, рассекающий демонов" },
      { id: "anime-113415", title: "Магическая битва" },
      { id: "anime-30276", title: "Ванпанчмен" },
      { id: "anime-269", title: "Блич" },
      { id: "anime-1735", title: "Наруто: Ураганные хроники" },
      { id: "anime-31964", title: "Моя геройская академия" },
      { id: "anime-97940", title: "Чёрный клевер" },
      { id: "anime-38000", title: "Клинок демонов" },
      { id: "anime-4181", title: "Кланнад: После истории" },
      { id: "anime-32281", title: "Твоё имя" },
      { id: "anime-199", title: "Унесённые призраками" },
      { id: "anime-164", title: "Мононоке" },
      { id: "anime-431", title: "Ходячий замок" },
      { id: "anime-6547", title: "Ангельские ритмы" },
      { id: "anime-11757", title: "Мастера меча онлайн" },
      { id: "anime-9919", title: "Синий экзорцист" },
      { id: "anime-10620", title: "Ре:Зеро" },
      { id: "anime-108465", title: "Магия и мускулы" },
      { id: "anime-127230", title: "Человек-бензопила" },
      { id: "anime-140960", title: "Семья шпиона" },
      { id: "anime-2187", title: "Моб Психо 100" },
      { id: "anime-918", title: "Гинтама" },
      { id: "anime-33486", title: "Боку-но хиро" },
      { id: "anime-1575", title: "Код Гиас" },
      { id: "anime-2904", title: "Код Гиас: Восставший Лелуш R2" },
      { id: "anime-19", title: "Монстр" },
      { id: "anime-790", title: "Эрго Прокси" },
      { id: "anime-457", title: "Муси-си" },
      { id: "anime-1", title: "Ковбой Бибоп" },
      { id: "anime-30", title: "Евангелион" },
      { id: "anime-45", title: "Руроуни Кэнсин" },
      { id: "anime-121", title: "Полное метаморфозы" },
      { id: "anime-849", title: "Судьба: Ночь схватки" },
    ],
  },
  {
    slug: "games-to-argue-about",
    name: "Игры, о которых спорят",
    description: "От всеобщих любимцев до самых неоднозначных.",
    category: "games",
    items: [
      { id: "game-1091500", title: "Cyberpunk 2077" },
      { id: "game-292030", title: "The Witcher 3: Wild Hunt" },
      { id: "game-1245620", title: "ELDEN RING" },
      { id: "game-489830", title: "The Elder Scrolls V: Skyrim" },
      { id: "game-271590", title: "Grand Theft Auto V" },
      { id: "game-620", title: "Portal 2" },
      { id: "game-570", title: "Dota 2" },
      { id: "game-1174180", title: "Red Dead Redemption 2" },
      { id: "game-413150", title: "Stardew Valley" },
      { id: "game-1086940", title: "Baldur's Gate 3" },
      { id: "game-730", title: "Counter-Strike 2" },
      { id: "game-440", title: "Team Fortress 2" },
      { id: "game-4000", title: "Garry's Mod" },
      { id: "game-105600", title: "Terraria" },
      { id: "game-322330", title: "Don't Starve Together" },
      { id: "game-252490", title: "Rust" },
      { id: "game-578080", title: "PUBG: Battlegrounds" },
      { id: "game-1172470", title: "Apex Legends" },
      { id: "game-359550", title: "Rainbow Six Siege" },
      { id: "game-1938090", title: "Call of Duty" },
      { id: "game-236850", title: "Europa Universalis IV" },
      { id: "game-281990", title: "Stellaris" },
      { id: "game-289070", title: "Civilization VI" },
      { id: "game-379720", title: "DOOM" },
      { id: "game-782330", title: "DOOM Eternal" },
      { id: "game-1030300", title: "Hollow Knight: Silksong" },
      { id: "game-367520", title: "Hollow Knight" },
      { id: "game-588650", title: "Dead Cells" },
      { id: "game-646570", title: "Slay the Spire" },
      { id: "game-1145360", title: "Hades" },
      { id: "game-268910", title: "Cuphead" },
      { id: "game-504230", title: "Celeste" },
      { id: "game-1057090", title: "Ori and the Will of the Wisps" },
      { id: "game-374320", title: "DARK SOULS III" },
      { id: "game-814380", title: "Sekiro: Shadows Die Twice" },
      { id: "game-1627720", title: "Lies of P" },
      { id: "game-1817070", title: "Marvel's Spider-Man Remastered" },
      { id: "game-1237970", title: "Titanfall 2" },
      { id: "game-292010", title: "Metal Gear Solid V" },
      { id: "game-1364780", title: "Street Fighter 6" },
    ],
  },
];

export function presetBySlug(slug: string): BattlePreset | undefined {
  return BATTLE_PRESETS.find((preset) => preset.slug === slug);
}

/**
 * Whether a preset entry and a ranked entry are plausibly the same work.
 *
 * The preset's id is a *hint*, not proof. These ids are hand-curated, and a
 * mistyped one would silently join to whatever the creator happens to have under
 * that number — putting their rating of a different film under this title's name
 * and then shipping it as their opinion in the battle. Comparing the titles too
 * makes a wrong id harmless: the join simply does not happen and the creator
 * rates the row by hand, which is the normal preset path anyway.
 */
export function titlesMatch(a: string, b: string): boolean {
  return normaliseTitle(a) === normaliseTitle(b);
}

function normaliseTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    // Punctuation and spacing vary between catalogs ("Ре:Зеро" / "Ре Зеро"),
    // and none of it distinguishes one work from another.
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * A deterministic shuffle of a preset's pool.
 *
 * Deterministic on purpose: the modal re-renders on every keystroke and every
 * tier the creator assigns, and a `Math.random` shuffle would deal a new hand
 * each time — rating an entry would make it jump or vanish. The seed changes
 * only when the creator asks for a reroll.
 */
export function shufflePreset<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  const random = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Small, fast, seedable PRNG — enough for dealing a hand of films. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
