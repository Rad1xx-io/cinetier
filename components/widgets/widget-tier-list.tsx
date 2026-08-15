"use client";

import { useEffect, useRef, useState } from "react";
import { Poster } from "@/components/movie-card/poster";
import { ChannelThumbnail } from "@/components/channel-card/channel-thumbnail";
import { WidgetBranding } from "@/components/widgets/widget-branding";
import { TIERS } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import type { RankedTitle, Tier } from "@/lib/types";
import { getPublicTierList, type PublicTierList } from "@/lib/supabase/profiles";
import { trackWidgetViewed } from "@/lib/analytics/events";
import { tierColorVar } from "@/lib/utils/tier-style";
import type { WidgetParams } from "@/lib/widgets/params";
import { cn } from "@/lib/utils/cn";

interface WidgetTierListProps {
  /** A public handle — the only id a board has in TierListOnline. */
  listId: string;
  params: WidgetParams;
}

interface Row {
  tier: Tier;
  titles: RankedTitle[];
  channels: RankedChannel[];
}

function buildRows(data: PublicTierList, limit: number | null): Row[] {
  const rows: Row[] = [];

  for (const tier of TIERS) {
    const titles = data.titles
      .filter((t) => t.tier === tier)
      .sort((a, b) => a.order - b.order);
    const channels = data.channels
      .filter((c) => c.tier === tier)
      .sort((a, b) => a.order - b.order);

    // Empty tiers are skipped rather than shown hollow: an overlay has no room
    // to spend on a row that says nothing, and "top N tiers" means N tiers with
    // something in them.
    if (titles.length === 0 && channels.length === 0) continue;
    rows.push({ tier, titles, channels });
    if (limit != null && rows.length >= limit) break;
  }

  return rows;
}

export function WidgetTierList({ listId, params }: WidgetTierListProps) {
  const [data, setData] = useState<PublicTierList | null | "missing">(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getPublicTierList(listId)
      .then((result) => {
        if (!cancelled) setData(result ?? "missing");
      })
      .catch(() => {
        if (!cancelled) setData("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [listId]);

  useEffect(() => {
    // Once per browser-source load. The ref survives Strict Mode's double
    // effect, which would otherwise report every overlay twice.
    if (reportedRef.current) return;
    reportedRef.current = true;
    trackWidgetViewed({ tierListId: listId, theme: params.theme, isCompact: params.compact });
  }, [listId, params.theme, params.compact]);

  // Nothing is drawn while loading. A spinner on a live broadcast is worse than
  // a moment of empty space the viewer never notices.
  if (data === null) return <div data-widget-root aria-hidden />;

  if (data === "missing") {
    return (
      <div data-widget-root className="p-3 text-xs text-white/70">
        Список недоступен
      </div>
    );
  }

  const rows = buildRows(data, params.limit);
  const posterWidth = params.compact ? "w-8" : "w-12";
  const plateWidth = params.compact ? "w-6" : "w-8";
  const gap = params.compact ? "gap-0.5" : "gap-1";

  return (
    <div
      data-widget-root
      className={cn(
        "inline-block rounded-xl",
        params.compact ? "p-2" : "p-3",
        params.theme === "dark" && "bg-[#09090b]/92 text-white",
        params.theme === "light" && "bg-white/92 text-black",
        params.theme === "transparent" && "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
      )}
    >
      {params.showTitle && (
        <p className={cn("mb-1.5 font-bold tracking-tight", params.compact ? "text-xs" : "text-sm")}>
          {data.profile.displayName || `@${data.profile.username}`}
        </p>
      )}

      <div className={cn("flex flex-col", gap)}>
        {rows.map((row) => (
          <div key={row.tier} className={cn("flex items-stretch", gap)}>
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded font-bold text-black",
                plateWidth,
                params.compact ? "text-[10px]" : "text-xs"
              )}
              style={{ backgroundColor: tierColorVar(row.tier) }}
              aria-hidden
            >
              {row.tier}
            </span>

            <div className={cn("flex flex-wrap", gap)}>
              {row.titles.map((title) => (
                <Poster
                  key={`${title.mediaType}-${title.tmdbId}`}
                  posterPath={title.posterPath}
                  title={title.title}
                  className={cn(posterWidth, "shrink-0")}
                  sizes="48px"
                />
              ))}
              {row.channels.map((channel) => (
                <div key={channel.channelId} className={cn(posterWidth, "shrink-0")}>
                  <ChannelThumbnail
                    thumbnailUrl={channel.thumbnailUrl}
                    title={channel.title}
                    sizes="48px"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <WidgetBranding listId={listId} theme={params.theme} className="mt-1.5" />
    </div>
  );
}
