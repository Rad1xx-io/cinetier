"use client";

import { Check, LayoutGrid, Rows3, RotateCcw, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Density } from "@/lib/hooks/use-density";
import type { ChannelSortMode } from "@/lib/utils/channel-tier-grouping";
import { cn } from "@/lib/utils/cn";

interface ChannelToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: ChannelSortMode;
  onSortChange: (value: ChannelSortMode) => void;
  density: Density;
  onDensityChange: (value: Density) => void;
  onReset: () => void;
  isDefault: boolean;
  saved: boolean;
}

export function ChannelToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  density,
  onDensityChange,
  onReset,
  isDefault,
  saved,
}: ChannelToolbarProps) {
  return (
    <div className="sticky top-0 z-30 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:top-16 md:mx-0 md:rounded-xl md:border md:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Поиск в моём списке…"
            className="pl-9 pr-9"
            aria-label="Поиск в моём списке"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Очистить поиск"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Плотность отображения">
            <button
              type="button"
              onClick={() => onDensityChange("comfortable")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                density === "comfortable" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
              )}
              aria-pressed={density === "comfortable"}
              title="Комфортный режим"
            >
              <Rows3 className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Комфортно</span>
            </button>
            <button
              type="button"
              onClick={() => onDensityChange("compact")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                density === "compact" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
              )}
              aria-pressed={density === "compact"}
              title="Компактный режим"
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Компактно</span>
            </button>
          </div>

          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as ChannelSortMode)}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Сортировка"
          >
            <option value="manual">Ручной порядок</option>
            <option value="newest">Недавно добавленные</option>
            <option value="title">Название А-Я</option>
            <option value="subscribers">По подписчикам</option>
          </select>

          <Button variant="ghost" size="sm" onClick={onReset} disabled={isDefault}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Сбросить фильтры
          </Button>

          <span
            className={cn(
              "flex items-center gap-1 text-xs text-muted transition-opacity",
              saved ? "opacity-100" : "opacity-0"
            )}
            aria-live="polite"
          >
            <Check className="h-3.5 w-3.5 text-accent" aria-hidden />
            Сохранено
          </span>
        </div>
      </div>
      {sort !== "manual" && (
        <p className="mt-2 text-xs text-muted">
          Перетаскивание доступно при сортировке «Ручной порядок».
        </p>
      )}
    </div>
  );
}
