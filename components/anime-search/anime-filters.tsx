"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ANIME_FORMATS, ANIME_SORTS, type AnimeFormat, type AnimeSortMode } from "@/lib/anilist/anime-filters";
import type { AnimeSeason, AnimeStatus } from "@/lib/types/anime";
import { FILTER_SELECT_CLASS } from "@/lib/utils/filter-styles";

export interface AnimeFilterState {
  genre: string;
  year: number | undefined;
  season: AnimeSeason | undefined;
  format: AnimeFormat | undefined;
  status: AnimeStatus | undefined;
  sort: AnimeSortMode;
}

export const DEFAULT_ANIME_FILTERS: AnimeFilterState = {
  genre: "",
  year: undefined,
  season: undefined,
  format: undefined,
  status: undefined,
  sort: "popularity",
};

export function isDefaultAnimeFilters(f: AnimeFilterState): boolean {
  return (
    f.genre === "" &&
    f.year === undefined &&
    f.season === undefined &&
    f.format === undefined &&
    f.status === undefined &&
    f.sort === "popularity"
  );
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR + 1 - 1960 + 1 }, (_, i) => CURRENT_YEAR + 1 - i);

const SEASONS: { value: AnimeSeason; label: string }[] = [
  { value: "WINTER", label: "Зима" },
  { value: "SPRING", label: "Весна" },
  { value: "SUMMER", label: "Лето" },
  { value: "FALL", label: "Осень" },
];

const STATUSES: { value: AnimeStatus; label: string }[] = [
  { value: "RELEASING", label: "Онгоинг" },
  { value: "FINISHED", label: "Завершён" },
  { value: "NOT_YET_RELEASED", label: "Анонс" },
  { value: "HIATUS", label: "Приостановлен" },
  { value: "CANCELLED", label: "Отменён" },
];

interface AnimeFiltersProps {
  value: AnimeFilterState;
  onChange: (next: AnimeFilterState) => void;
  genres: string[];
  canReset: boolean;
  onReset: () => void;
}

export function AnimeFilters({ value, onChange, genres, canReset, onReset }: AnimeFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.genre}
        onChange={(e) => onChange({ ...value, genre: e.target.value })}
        className={FILTER_SELECT_CLASS}
        aria-label="Жанр"
      >
        <option value="">Все жанры</option>
        {genres.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>

      <select
        value={value.season ?? ""}
        onChange={(e) =>
          onChange({ ...value, season: e.target.value ? (e.target.value as AnimeSeason) : undefined })
        }
        className={FILTER_SELECT_CLASS}
        aria-label="Сезон"
      >
        <option value="">Все сезоны</option>
        {SEASONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        value={value.year ?? ""}
        onChange={(e) =>
          onChange({ ...value, year: e.target.value ? Number(e.target.value) : undefined })
        }
        className={FILTER_SELECT_CLASS}
        aria-label="Год выхода"
      >
        <option value="">Все годы</option>
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <select
        value={value.format ?? ""}
        onChange={(e) =>
          onChange({ ...value, format: e.target.value ? (e.target.value as AnimeFormat) : undefined })
        }
        className={FILTER_SELECT_CLASS}
        aria-label="Формат"
      >
        <option value="">Любой формат</option>
        {ANIME_FORMATS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        value={value.status ?? ""}
        onChange={(e) =>
          onChange({ ...value, status: e.target.value ? (e.target.value as AnimeStatus) : undefined })
        }
        className={FILTER_SELECT_CLASS}
        aria-label="Статус"
      >
        <option value="">Любой статус</option>
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        value={value.sort}
        onChange={(e) => onChange({ ...value, sort: e.target.value as AnimeSortMode })}
        className={FILTER_SELECT_CLASS}
        aria-label="Сортировка"
      >
        {ANIME_SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <Button variant="ghost" size="sm" onClick={onReset} disabled={!canReset}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Сбросить
      </Button>
    </div>
  );
}
