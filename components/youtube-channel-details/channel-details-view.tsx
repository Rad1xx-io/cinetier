"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Users, Video } from "lucide-react";
import { useRankedChannels } from "@/lib/hooks/use-ranked-channels";
import { ChannelThumbnail } from "@/components/channel-card/channel-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TierOrUnrated } from "@/lib/types";
import { TIER_ORDER } from "@/lib/types";
import type { ChannelDetails } from "@/lib/types/youtube";
import { formatCompactCount } from "@/lib/utils/format";
import { tierColorVar, tierLabel } from "@/lib/utils/tier-style";
import { findCountryLabel } from "@/lib/youtube/region-groups";
import { cn } from "@/lib/utils/cn";
import { trackItemAdded, trackItemRanked } from "@/lib/analytics/events";

export function ChannelDetailsView({ details }: { details: ChannelDetails }) {
  const { channels, add, remove, setTier, hydrated } = useRankedChannels();

  const ranked = channels.find((c) => c.channelId === details.channelId);

  function handleAdd() {
    trackItemAdded(`youtube-${details.channelId}`, "youtube", "details");
    add({
      channelId: details.channelId,
      title: details.title,
      thumbnailUrl: details.thumbnailUrl,
      country: details.country,
      subscriberCount: details.subscriberCount ?? undefined,
    });
  }

  function handleTierChange(tier: TierOrUnrated) {
    trackItemRanked(`youtube-${details.channelId}`, tier, ranked?.tier);
    if (!ranked) {
      add({
        channelId: details.channelId,
        title: details.title,
        thumbnailUrl: details.thumbnailUrl,
        country: details.country,
        subscriberCount: details.subscriberCount ?? undefined,
        tier,
      });
    } else {
      setTier(details.channelId, tier);
    }
  }

  return (
    <div>
      <div className="relative h-40 w-full overflow-hidden bg-surface-raised sm:h-56">
        {details.bannerUrl ? (
          <Image src={details.bannerUrl} alt="" fill priority className="object-cover" sizes="100vw" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-surface-raised to-surface" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <Link
          href="/youtube"
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-background/70 backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:left-6"
          aria-label="Back to search"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="mx-auto -mt-14 max-w-4xl px-4 pb-16 sm:-mt-16 md:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <ChannelThumbnail
            thumbnailUrl={details.thumbnailUrl}
            title={details.title}
            priority
            className="w-28 shrink-0 shadow-2xl ring-4 ring-background sm:w-36"
            sizes="(max-width: 640px) 112px, 144px"
          />

          <div className="flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {details.country && <Badge variant="outline">{findCountryLabel(details.country)}</Badge>}
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" aria-hidden />
                {formatCompactCount(details.subscriberCount)} subscribers
              </span>
              <span className="flex items-center gap-1">
                <Video className="h-3.5 w-3.5" aria-hidden />
                {formatCompactCount(details.videoCount)} videos
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{details.title}</h1>
          </div>
        </div>

        <p className="mt-6 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-foreground/90">
          {details.description || "No description available."}
        </p>

        <div className="mt-6 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Status:{" "}
            <span className="text-foreground">
              {!hydrated ? "…" : !ranked ? "Not added" : tierLabel(ranked.tier)}
            </span>
          </p>

          {!ranked ? (
            <Button onClick={handleAdd} disabled={!hydrated}>
              <Plus className="h-4 w-4" aria-hidden />
              Add to my list
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Change tier">
                {TIER_ORDER.map((tier) => {
                  const active = ranked.tier === tier;
                  const isUnrated = tier === "Unrated";
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => handleTierChange(tier)}
                      aria-pressed={active}
                      className={cn(
                        "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        active ? "border-transparent text-background" : "border-border text-muted hover:text-foreground"
                      )}
                      style={active ? { backgroundColor: isUnrated ? "var(--muted)" : tierColorVar(tier) } : undefined}
                    >
                      {isUnrated ? "—" : tier}
                    </button>
                  );
                })}
              </div>
              <Button variant="destructive" size="sm" onClick={() => remove(details.channelId)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Remove
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
