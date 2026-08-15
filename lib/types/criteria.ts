/** Which catalog a preset belongs to. "general" fits anything. */
export type CategoryType = "cinema" | "games" | "anime" | "general";

export interface CriterionScore {
  /** Stable across renames: presets use a fixed slug, custom entries a generated one. */
  criterionId: string;
  name: string;
  /** 1.0–10.0, one decimal place. */
  score: number;
}

export interface CriterionPreset {
  id: string;
  name: string;
}

export interface PresetGroup {
  id: string;
  label: string;
  category: CategoryType;
  criteria: CriterionPreset[];
}

/** The slider's range, shared by the component and any validation. */
export const SCORE_MIN = 1;
export const SCORE_MAX = 10;
export const SCORE_STEP = 0.1;
/** Where a freshly added criterion starts — the midpoint, so it reads as "unjudged". */
export const SCORE_DEFAULT = 5;

/**
 * Ready-made criteria, grouped by what they measure rather than by catalog
 * alone: a film can be rated on craft, on how much fun it was, or both, and
 * forcing that into one list would make either half look like an odd fit.
 */
export const DEFAULT_PRESETS: PresetGroup[] = [
  {
    id: "cinema-technical",
    label: "Film — craft",
    category: "cinema",
    criteria: [
      { id: "story", name: "Story" },
      { id: "screenplay", name: "Screenplay" },
      { id: "acting", name: "Acting" },
      { id: "cinematography", name: "Cinematography" },
      { id: "editing", name: "Editing" },
      { id: "sound", name: "Sound" },
      { id: "music", name: "Music" },
    ],
  },
  {
    id: "cinema-entertainment",
    label: "Film — experience",
    category: "cinema",
    criteria: [
      { id: "action", name: "Action" },
      { id: "fun", name: "Fun" },
      { id: "rewatchability", name: "Rewatchability" },
      { id: "atmosphere", name: "Atmosphere" },
    ],
  },
  {
    id: "games",
    label: "Games",
    category: "games",
    criteria: [
      { id: "gameplay", name: "Gameplay" },
      { id: "graphics", name: "Graphics" },
      { id: "replayability", name: "Replayability" },
      { id: "world", name: "World" },
      { id: "game-sound", name: "Sound" },
    ],
  },
];

/** Flat lookup for resolving a preset id without walking the groups. */
export const PRESET_BY_ID: Record<string, CriterionPreset> = Object.fromEntries(
  DEFAULT_PRESETS.flatMap((group) => group.criteria.map((c) => [c.id, c]))
);

/** Comparable form of a name, so "Story" and " story " count as the same criterion. */
export function normalizeCriterionName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * The breakdown reduced to a single number, or null when there is nothing to
 * average. Deliberately a plain mean: weighting criteria would need weights the
 * user never supplied, and inventing them would make the figure unexplainable.
 */
export function criteriaAverage(scores: CriterionScore[] | undefined): number | null {
  if (!scores || scores.length === 0) return null;
  const total = scores.reduce((sum, s) => sum + s.score, 0);
  return Math.round((total / scores.length) * 10) / 10;
}

/** Keeps a score inside the slider's range and to one decimal. */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return SCORE_DEFAULT;
  return Math.round(Math.min(SCORE_MAX, Math.max(SCORE_MIN, value)) * 10) / 10;
}
