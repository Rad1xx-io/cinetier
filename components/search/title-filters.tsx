"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TITLE_SORTS, type TitleSort } from "@/lib/tmdb/title-filters";
import { FILTER_SELECT_CLASS } from "@/lib/utils/filter-styles";

export interface TitleFilterState {
  genre: string;
  year: number | undefined;
  minRating: number;
  sort: TitleSort;
}

export const DEFAULT_TITLE_FILTERS: TitleFilterState = {
  genre: "",
  year: undefined,
  minRating: 0,
  sort: "popularity",
};

export function isDefaultTitleFilters(f: TitleFilterState): boolean {
  return (
    f.genre === "" && f.year === undefined && f.minRating === 0 && f.sort === "popularity"
  );
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1950 + 1 }, (_, i) => CURRENT_YEAR - i);

const RATINGS = [6, 7, 7.5, 8, 8.5, 9];

interface TitleFiltersProps {
  value: TitleFilterState;
  onChange: (next: TitleFilterState) => void;
  genres: { slug: string; label: string }[];
  canReset: boolean;
  onReset: () => void;
}

export function TitleFilters({ value, onChange, genres, canReset, onReset }: TitleFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.genre}
        onChange={(e) => onChange({ ...value, genre: e.target.value })}
        className={FILTER_SELECT_CLASS}
        aria-label="Genre"
      >
        <option value="">All genres</option>
        {genres.map((g) => (
          <option key={g.slug} value={g.slug}>
            {g.label}
          </option>
        ))}
      </select>

      <select
        value={value.year ?? ""}
        onChange={(e) => onChange({ ...value, year: e.target.value ? Number(e.target.value) : undefined })}
        className={FILTER_SELECT_CLASS}
        aria-label="Release year"
      >
        <option value="">All years</option>
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <select
        value={value.minRating}
        onChange={(e) => onChange({ ...value, minRating: Number(e.target.value) })}
        className={FILTER_SELECT_CLASS}
        aria-label="Minimum rating"
      >
        <option value={0}>Any rating</option>
        {RATINGS.map((r) => (
          <option key={r} value={r}>
            {r}+
          </option>
        ))}
      </select>

      <select
        value={value.sort}
        onChange={(e) => onChange({ ...value, sort: e.target.value as TitleSort })}
        className={FILTER_SELECT_CLASS}
        aria-label="Sort"
      >
        {TITLE_SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <Button variant="ghost" size="sm" onClick={onReset} disabled={!canReset}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Reset
      </Button>
    </div>
  );
}
