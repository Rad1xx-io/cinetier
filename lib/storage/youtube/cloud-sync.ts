"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PullOutcome } from "@/lib/storage/sync-decision";
import type { RankedChannel } from "@/lib/types/youtube";

/** Same ceiling, and the same reason, as the titles push's own chunk size. */
const DELETE_CHUNK_SIZE = 100;

interface RankedChannelRow {
  channel_id: string;
  title: string;
  thumbnail_url: string | null;
  country: string | null;
  tier: RankedChannel["tier"];
  order: number;
  subscriber_count: number | null;
  added_at: number;
  updated_at: number;
}

function toRow(userId: string, c: RankedChannel): RankedChannelRow & { user_id: string } {
  return {
    user_id: userId,
    channel_id: c.channelId,
    title: c.title,
    thumbnail_url: c.thumbnailUrl,
    country: c.country,
    tier: c.tier,
    order: c.order,
    subscriber_count: c.subscriberCount ?? null,
    added_at: c.addedAt,
    updated_at: c.updatedAt,
  };
}

function fromRow(row: RankedChannelRow): RankedChannel {
  return {
    channelId: row.channel_id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    country: row.country,
    tier: row.tier,
    order: row.order,
    subscriberCount: row.subscriber_count ?? undefined,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}

/** Same contract as pullCloudTitles: a failure is not an empty account. */
export async function pullCloudChannels(userId: string): Promise<PullOutcome<RankedChannel>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { status: "failed", reason: "cloud accounts are not configured" };

  const { data, error } = await supabase
    .from("ranked_channels")
    .select("channel_id,title,thumbnail_url,country,tier,order,subscriber_count,added_at,updated_at")
    .eq("user_id", userId);

  if (error || !data) {
    console.error("TierListOnline: failed to pull cloud channel rankings", error);
    return { status: "failed", reason: error?.message ?? "no data returned" };
  }

  return { status: "ok", items: data.map(fromRow) };
}

export async function pushCloudChannels(userId: string, channels: RankedChannel[]): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  if (channels.length > 0) {
    const rows = channels.map((c) => toRow(userId, c));
    const { error } = await supabase
      .from("ranked_channels")
      .upsert(rows, { onConflict: "user_id,channel_id" });
    if (error) {
      console.error("TierListOnline: failed to push channel rankings to cloud", error);
      return;
    }
  }

  const { data: existing, error: fetchError } = await supabase
    .from("ranked_channels")
    .select("channel_id")
    .eq("user_id", userId);

  if (fetchError || !existing) return;

  const localKeys = new Set(channels.map((c) => c.channelId));
  const staleRows = (existing as Pick<RankedChannelRow, "channel_id">[]).filter(
    (row) => !localKeys.has(row.channel_id)
  );

  // Batched for the same reason as the titles push — see its comment. The key
  // here is a single column, so there is nothing to group by first.
  const staleIds = staleRows.map((row) => row.channel_id);
  for (let from = 0; from < staleIds.length; from += DELETE_CHUNK_SIZE) {
    const { error: deleteError } = await supabase
      .from("ranked_channels")
      .delete()
      .eq("user_id", userId)
      .in("channel_id", staleIds.slice(from, from + DELETE_CHUNK_SIZE));

    if (deleteError) {
      console.error("TierListOnline: failed to remove stale cloud channel rankings", deleteError);
      return;
    }
  }
}
