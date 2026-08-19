"use client";

import Link from "next/link";
import { ExternalLink, Eye, PlaySquare, Plus, Users } from "lucide-react";
import { ChannelThumbnail } from "@/components/channel-card/channel-thumbnail";
import { TierPill } from "@/components/movie-card/tier-pill";
import { Badge } from "@/components/ui/badge";
import { ContentTypeBadge } from "@/components/ui/content-type-badge";
import { Button } from "@/components/ui/button";
import type { ChannelSummary, RankedChannel } from "@/lib/types/youtube";
import { formatCompactCount } from "@/lib/utils/format";
import { findCountryLabel, flagEmoji } from "@/lib/youtube/region-groups";

interface DiscoverChannelCardProps {
  channel: ChannelSummary;
  ranked?: RankedChannel;
  onAdd: (channel: ChannelSummary) => void;
}

export function DiscoverChannelCard({ channel, ranked, onAdd }: DiscoverChannelCardProps) {
  const href = `/youtube/channel/${channel.channelId}`;
  const youtubeUrl = channel.handle
    ? `https://www.youtube.com/${channel.handle}`
    : `https://www.youtube.com/channel/${channel.channelId}`;

  return (
    <div className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-all duration-200 hover:scale-[1.02] hover:border-accent/40">
      <div className="flex items-start gap-3">
        <Link href={href} className="shrink-0">
          <ChannelThumbnail
            thumbnailUrl={channel.thumbnailUrl}
            title={channel.title}
            className="w-14"
            // The circle is 56px (w-14). Without this the component falls back
            // to its own 120px guess and fetches an avatar four times the size
            // it paints — which mattered nothing while the optimizer re-encoded
            // them, and is 155KB a page now that it does not.
            sizes="56px"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={href} className="line-clamp-1 break-words text-sm font-semibold hover:text-accent">
            {channel.title}
          </Link>
          {channel.handle && <p className="line-clamp-1 break-words text-xs text-muted">{channel.handle}</p>}
          {channel.country && (
            <Badge variant="outline" className="mt-1 px-1.5 py-0 text-[10px]">
              {flagEmoji(channel.country)} {findCountryLabel(channel.country)}
            </Badge>
          )}
        </div>
      </div>

      {channel.description && <p className="line-clamp-2 break-words text-xs text-muted">{channel.description}</p>}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <ContentTypeBadge type="youtube" />
        {channel.subscriberCount !== null && (
          <span className="flex items-center gap-1" title="Subscribers">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {formatCompactCount(channel.subscriberCount)}
          </span>
        )}
        {channel.viewCount !== null && (
          <span className="flex items-center gap-1" title="Views">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            {formatCompactCount(channel.viewCount)}
          </span>
        )}
        {channel.videoCount !== null && (
          <span className="flex items-center gap-1" title="Videos">
            <PlaySquare className="h-3.5 w-3.5" aria-hidden />
            {formatCompactCount(channel.videoCount)}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted hover:text-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          YouTube
        </a>
        {ranked ? (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            Tier <TierPill tier={ranked.tier} />
          </span>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => onAdd(channel)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add
          </Button>
        )}
      </div>
    </div>
  );
}
