import type { TierOrUnrated } from "@/lib/types";

export interface TierMeta {
  name: string;
  description: string;
}

/** Russian display name + explanation for each tier, shown in the tier list label column. */
export const TIER_META: Record<TierOrUnrated, TierMeta> = {
  S: { name: "Шедевры", description: "Лучшие фильмы и сериалы. То, что я считаю выдающимся." },
  A: { name: "Отличные", description: "Очень сильные фильмы и сериалы, почти топ-уровень." },
  B: { name: "Хорошие", description: "Качественные и приятные для просмотра." },
  C: { name: "Нормальные", description: "Есть хорошие стороны, но ничего особенного." },
  D: { name: "Слабые", description: "Скорее разочаровали или имеют заметные недостатки." },
  F: { name: "Плохие", description: "Не понравились или считаю неудачными." },
  Unrated: { name: "Не оценено", description: "Фильмы и сериалы, которые я добавил, но ещё не оценил." },
};
