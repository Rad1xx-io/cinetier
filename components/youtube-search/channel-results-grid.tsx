import { DiscoverChannelCard } from "@/components/channel-card/discover-channel-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChannelSummary, RankedChannel } from "@/lib/types/youtube";

interface ChannelResultsGridProps {
  channels: ChannelSummary[];
  rankedByKey: Map<string, RankedChannel>;
  onAdd: (channel: ChannelSummary) => void;
  loading?: boolean;
}

export function ChannelResultsGrid({ channels, rankedByKey, onAdd, loading }: ChannelResultsGridProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Loading channels…</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No channels match these filters.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {channels.map((channel) => (
        <DiscoverChannelCard
          key={channel.channelId}
          channel={channel}
          ranked={rankedByKey.get(channel.channelId)}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}
