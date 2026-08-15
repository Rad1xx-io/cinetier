"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GAME_CATEGORIES,
  GAME_GENRES,
  GAME_PLATFORMS,
  GAME_SORTS,
  type GameCategory,
  type GameGenre,
  type GamePlatform,
  type GameSort,
} from "@/lib/steam/filters";

export interface GameFilterState {
  genre: GameGenre | "";
  platform: GamePlatform | "";
  category: GameCategory | "";
  sort: GameSort;
}

export const DEFAULT_GAME_FILTERS: GameFilterState = {
  genre: "",
  platform: "",
  category: "",
  sort: "popularity",
};

export function isDefaultGameFilters(f: GameFilterState): boolean {
  return (
    f.genre === DEFAULT_GAME_FILTERS.genre &&
    f.platform === DEFAULT_GAME_FILTERS.platform &&
    f.category === DEFAULT_GAME_FILTERS.category &&
    f.sort === DEFAULT_GAME_FILTERS.sort
  );
}

interface GameFiltersProps {
  value: GameFilterState;
  onChange: (next: GameFilterState) => void;
  /** True while a request is in flight — the controls stay usable, this only drives the reset button. */
  canReset: boolean;
  onReset: () => void;
}

const selectClass =
  "h-10 shrink-0 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function GameFilters({ value, onChange, canReset, onReset }: GameFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.genre}
        onChange={(e) => onChange({ ...value, genre: e.target.value as GameGenre | "" })}
        className={selectClass}
        aria-label="Genre"
      >
        <option value="">All genres</option>
        {GAME_GENRES.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>

      <select
        value={value.platform}
        onChange={(e) => onChange({ ...value, platform: e.target.value as GamePlatform | "" })}
        className={selectClass}
        aria-label="Platform"
      >
        <option value="">All platforms</option>
        {GAME_PLATFORMS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      <select
        value={value.category}
        onChange={(e) => onChange({ ...value, category: e.target.value as GameCategory | "" })}
        className={selectClass}
        aria-label="Game mode"
      >
        <option value="">Any mode</option>
        {GAME_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        value={value.sort}
        onChange={(e) => onChange({ ...value, sort: e.target.value as GameSort })}
        className={selectClass}
        aria-label="Sort"
      >
        {GAME_SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <Button variant="ghost" size="sm" onClick={onReset} disabled={!canReset}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Reset filters
      </Button>
    </div>
  );
}
