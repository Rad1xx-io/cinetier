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
  { value: 0, label: "Any subscriber count" },
  { value: 1_000, label: "1K+" },
  { value: 10_000, label: "10K+" },
  { value: 50_000, label: "50K+" },
  { value: 100_000, label: "100K+" },
  { value: 500_000, label: "500K+" },
  { value: 1_000_000, label: "1M+" },
  { value: 5_000_000, label: "5M+" },
  { value: 10_000_000, label: "10M+" },
  { value: 50_000_000, label: "50M+" },
];

const SORTS: { value: ChannelSortMode; label: string }[] = [
  { value: "subscribers_desc", label: "Subscribers ↓" },
  { value: "subscribers_asc", label: "Subscribers ↑" },
  { value: "views_desc", label: "Views ↓" },
  { value: "views_asc", label: "Views ↑" },
  { value: "newest", label: "Newest" },
  { value: "title", label: "Name A–Z" },
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
        aria-label="Minimum subscribers"
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
        aria-label="Sort"
      >
        {SORTS.map((s) => (
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
