import type { BattleCategory } from "@/lib/types/battle";

/**
 * Ready-made battle line-ups, for people whose own list is too short or too
 * personal to make a good round.
 *
 * These are curated data, not a catalog query. A themed set has to be stable —
 * a battle created today and played next month must contain the same items — and
 * "Top games of 2024" from a live popularity endpoint would quietly become something
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
    name: "Modern classics",
    description: "The films people argue about most.",
    category: "cinema",
    items: [
      { id: "movie-27205", title: "Inception" },
      { id: "movie-157336", title: "Interstellar" },
      { id: "movie-155", title: "The Dark Knight" },
      { id: "movie-680", title: "Pulp Fiction" },
      { id: "movie-550", title: "Fight Club" },
      { id: "movie-13", title: "Forrest Gump" },
      { id: "movie-278", title: "The Shawshank Redemption" },
      { id: "movie-603", title: "The Matrix" },
      { id: "movie-496243", title: "Parasite" },
      { id: "movie-129", title: "Spirited Away" },
      { id: "movie-238", title: "The Godfather" },
      { id: "movie-240", title: "The Godfather Part II" },
      { id: "movie-424", title: "Schindler's List" },
      { id: "movie-389", title: "12 Angry Men" },
      { id: "movie-769", title: "GoodFellas" },
      { id: "movie-311", title: "Once Upon a Time in America" },
      { id: "movie-807", title: "Se7en" },
      { id: "movie-274", title: "The Silence of the Lambs" },
      { id: "movie-1891", title: "The Empire Strikes Back" },
      { id: "movie-11", title: "Star Wars" },
      { id: "movie-120", title: "The Lord of the Rings: The Fellowship of the Ring" },
      { id: "movie-122", title: "The Lord of the Rings: The Return of the King" },
      { id: "movie-539", title: "Psycho" },
      { id: "movie-947", title: "Lawrence of Arabia" },
      { id: "movie-599", title: "Sunset Boulevard" },
      { id: "movie-289", title: "Casablanca" },
      { id: "movie-73", title: "American History X" },
      { id: "movie-1124", title: "The Prestige" },
      { id: "movie-77", title: "Memento" },
      { id: "movie-641", title: "Requiem for a Dream" },
      { id: "movie-4922", title: "The Curious Case of Benjamin Button" },
      { id: "movie-475557", title: "Joker" },
      { id: "movie-438631", title: "Dune" },
      { id: "movie-335984", title: "Blade Runner 2049" },
      { id: "movie-329865", title: "Arrival" },
      { id: "movie-693134", title: "Dune: Part Two" },
      { id: "movie-872585", title: "Oppenheimer" },
      { id: "movie-361743", title: "Top Gun: Maverick" },
      { id: "movie-545611", title: "Everything Everywhere All at Once" },
      { id: "movie-530915", title: "1917" },
      { id: "movie-466272", title: "Once Upon a Time... in Hollywood" },
      { id: "movie-324857", title: "Spider-Man: Into the Spider-Verse" },
    ],
  },
  {
    slug: "prestige-tv",
    name: "Great TV",
    description: "The ones somebody will always call the best ever made.",
    category: "cinema",
    items: [
      { id: "tv-1396", title: "Breaking Bad" },
      { id: "tv-1399", title: "Game of Thrones" },
      { id: "tv-1398", title: "The Sopranos" },
      { id: "tv-60059", title: "Better Call Saul" },
      { id: "tv-1438", title: "The Wire" },
      { id: "tv-66732", title: "Stranger Things" },
      { id: "tv-87108", title: "Chernobyl" },
      { id: "tv-76479", title: "The Boys" },
      { id: "tv-94605", title: "Arcane" },
      { id: "tv-71912", title: "The Witcher" },
      { id: "tv-1668", title: "Friends" },
      { id: "tv-1418", title: "The Big Bang Theory" },
      { id: "tv-2316", title: "The Office" },
      { id: "tv-1100", title: "How I Met Your Mother" },
      { id: "tv-4614", title: "NCIS" },
      { id: "tv-1416", title: "Grey's Anatomy" },
      { id: "tv-1622", title: "Supernatural" },
      { id: "tv-456", title: "The Simpsons" },
      { id: "tv-1434", title: "Family Guy" },
      { id: "tv-60625", title: "Rick and Morty" },
      { id: "tv-46648", title: "True Detective" },
      { id: "tv-1408", title: "House" },
      { id: "tv-31917", title: "Pretty Little Liars" },
      { id: "tv-63174", title: "Lucifer" },
      { id: "tv-62560", title: "Mr. Robot" },
      { id: "tv-1402", title: "The Walking Dead" },
      { id: "tv-82856", title: "The Mandalorian" },
      { id: "tv-85552", title: "Euphoria" },
      { id: "tv-60735", title: "The Flash" },
      { id: "tv-1429", title: "Attack on Titan" },
      { id: "tv-70523", title: "Dark" },
      { id: "tv-95557", title: "INVINCIBLE" },
      { id: "tv-100088", title: "The Last of Us" },
      { id: "tv-119051", title: "Wednesday" },
      { id: "tv-84958", title: "Loki" },
      { id: "tv-95396", title: "Severance" },
      { id: "tv-136315", title: "The Bear" },
      { id: "tv-124364", title: "FROM" },
      { id: "tv-92749", title: "Moon Knight" },
      { id: "tv-90802", title: "The Sandman" },
    ],
  },
  {
    slug: "anime-essentials",
    name: "Anime everyone recommends",
    description: "The classic set for an argument about taste.",
    category: "anime",
    items: [
      { id: "anime-16498", title: "Attack on Titan" },
      { id: "anime-1535", title: "Death Note" },
      { id: "anime-5114", title: "Fullmetal Alchemist: Brotherhood" },
      { id: "anime-9253", title: "Steins;Gate" },
      { id: "anime-11061", title: "Hunter x Hunter (2011)" },
      { id: "anime-21", title: "ONE PIECE" },
      { id: "anime-20", title: "Naruto" },
      { id: "anime-101922", title: "Demon Slayer: Kimetsu no Yaiba" },
      { id: "anime-113415", title: "JUJUTSU KAISEN" },
      { id: "anime-21087", title: "One-Punch Man" },
      { id: "anime-269", title: "Bleach" },
      { id: "anime-1735", title: "Naruto: Shippuden" },
      { id: "anime-21459", title: "My Hero Academia" },
      { id: "anime-97940", title: "Black Clover" },
      { id: "anime-4181", title: "Clannad: After Story" },
      { id: "anime-21519", title: "Your Name." },
      { id: "anime-199", title: "Spirited Away" },
      { id: "anime-164", title: "Princess Mononoke" },
      { id: "anime-431", title: "Howl‘s Moving Castle" },
      { id: "anime-6547", title: "Angel Beats!" },
      { id: "anime-11757", title: "Sword Art Online" },
      { id: "anime-9919", title: "Blue Exorcist" },
      { id: "anime-10620", title: "The Future Diary" },
      { id: "anime-108465", title: "Mushoku Tensei: Jobless Reincarnation" },
      { id: "anime-127230", title: "Chainsaw Man" },
      { id: "anime-140960", title: "SPY x FAMILY" },
      { id: "anime-2187", title: "Gold Throbber" },
      { id: "anime-918", title: "Gintama" },
      { id: "anime-1575", title: "Code Geass: Lelouch of the Rebellion" },
      { id: "anime-2904", title: "Code Geass: Lelouch of the Rebellion R2" },
      { id: "anime-19", title: "Monster" },
      { id: "anime-790", title: "Ergo Proxy" },
      { id: "anime-457", title: "MUSHI-SHI" },
      { id: "anime-1", title: "Cowboy Bebop" },
      { id: "anime-30", title: "Neon Genesis Evangelion" },
      { id: "anime-45", title: "Rurouni Kenshin" },
      { id: "anime-121", title: "Fullmetal Alchemist" },
      { id: "anime-849", title: "The Melancholy of Haruhi Suzumiya" },
    ],
  },
  {
    slug: "games-to-argue-about",
    name: "Games people argue about",
    description: "From universal favourites to the most divisive.",
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
