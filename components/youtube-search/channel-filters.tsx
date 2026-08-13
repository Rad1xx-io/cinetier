"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountrySelect } from "@/components/youtube-search/country-select";
import type { ChannelSortMode } from "@/lib/youtube/channel-lookup";
import { FILTER_SELECT_CLASS } from "@/lib/utils/filter-styles";

export interface ChannelFilterState {
  country: string;
  minSubscribers: number;
  sort: ChannelSortMode;
}

export const DEFAULT_CHANNEL_FILTERS: ChannelFilterState = {
  country: "",
  minSubscribers: 0,
  sort: "subscribers_desc",
};

export function isDefaultChannelFilters(f: ChannelFilterState): boolean {
  return f.country === "" && f.minSubscribers === 0 && f.sort === "subscribers_desc";
}

const SUBSCRIBER_TIERS = [
  { value: 0, label: "Любое число подписчиков" },
  { value: 1_000, label: "От 1 тыс." },
  { value: 10_000, label: "От 10 тыс." },
  { value: 50_000, label: "От 50 тыс." },
  { value: 100_000, label: "От 100 тыс." },
  { value: 500_000, label: "От 500 тыс." },
  { value: 1_000_000, label: "От 1 млн" },
  { value: 5_000_000, label: "От 5 млн" },
  { value: 10_000_000, label: "От 10 млн" },
  { value: 50_000_000, label: "От 50 млн" },
];

const SORTS: { value: ChannelSortMode; label: string }[] = [
  { value: "subscribers_desc", label: "Подписчики ↓" },
  { value: "subscribers_asc", label: "Подписчики ↑" },
  { value: "views_desc", label: "Просмотры ↓" },
  { value: "views_asc", label: "Просмотры ↑" },
  { value: "newest", label: "Недавно созданные" },
  { value: "title", label: "Название А-Я" },
];

interface ChannelFiltersProps {
  value: ChannelFilterState;
  onChange: (next: ChannelFilterState) => void;
  canReset: boolean;
  onReset: () => void;
}

export function ChannelFilters({ value, onChange, canReset, onReset }: ChannelFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CountrySelect
        value={value.country}
        onChange={(country) => onChange({ ...value, country })}
      />

      <select
        value={value.minSubscribers}
        onChange={(e) => onChange({ ...value, minSubscribers: Number(e.target.value) })}
        className={FILTER_SELECT_CLASS}
        aria-label="Минимум подписчиков"
      >
        {SUBSCRIBER_TIERS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <select
        value={value.sort}
        onChange={(e) => onChange({ ...value, sort: e.target.value as ChannelSortMode })}
        className={FILTER_SELECT_CLASS}
        aria-label="Сортировка"
      >
        {SORTS.map((s) => (
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
