"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";

export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
  isPublic: boolean;
}

interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  is_public: boolean;
}

function fromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isPublic: row.is_public,
  };
}

/** Mirrors the CHECK constraint in migration 004 so the UI rejects the same values the database would. */
export const USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;

export function validateUsername(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value.length < 3) return "Минимум 3 символа.";
  if (value.length > 20) return "Максимум 20 символов.";
  if (!USERNAME_PATTERN.test(value)) {
    return "Только латинские буквы, цифры, дефис и подчёркивание.";
  }
  return null;
}

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name,is_public")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return fromRow(data as ProfileRow);
}

export type SaveProfileResult =
  | { ok: true; profile: Profile }
  | { ok: false; error: string };

export async function saveProfile(input: {
  userId: string;
  username: string;
  displayName: string;
}): Promise<SaveProfileResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "Облачные аккаунты не настроены." };

  const username = input.username.trim().toLowerCase();
  const invalid = validateUsername(username);
  if (invalid) return { ok: false, error: invalid };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: input.userId,
        username,
        display_name: input.displayName.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("id,username,display_name,is_public")
    .single();

  if (error) {
    // 23505 is Postgres' unique_violation — the only failure worth spelling out.
    const taken = error.code === "23505" || /duplicate key/i.test(error.message);
    return {
      ok: false,
      error: taken ? "Этот юзернейм уже занят." : "Не удалось сохранить профиль.",
    };
  }

  return { ok: true, profile: fromRow(data as ProfileRow) };
}

export interface PublicTierList {
  profile: Profile;
  titles: RankedTitle[];
  channels: RankedChannel[];
}

interface PublicTitleRow {
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  tier: TierOrUnrated;
  order: number;
  vote_average: number | null;
  added_at: number;
  updated_at: number;
}

interface PublicChannelRow {
  channel_id: string;
  title: string;
  thumbnail_url: string | null;
  country: string | null;
  tier: TierOrUnrated;
  order: number;
  subscriber_count: number | null;
  added_at: number;
  updated_at: number;
}

/** Publishes or unpublishes the list without touching the handle. */
export async function setProfileVisibility(
  userId: string,
  isPublic: boolean
): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from("profiles")
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq("id", userId);
  return !error;
}

/**
 * Reads someone else's published list. Relies entirely on the RLS policies from
 * migration 004: an unpublished profile simply yields no rows rather than an
 * error, so the caller treats "nothing found" and "not shared" the same way.
 */
export async function getPublicTierList(username: string): Promise<PublicTierList | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id,username,display_name,is_public")
    .eq("username", username.toLowerCase())
    .maybeSingle();

  if (!profileRow) return null;
  const profile = fromRow(profileRow as ProfileRow);
  if (!profile.isPublic) return null;

  const [titlesRes, channelsRes] = await Promise.all([
    supabase
      .from("ranked_titles")
      .select("tmdb_id,media_type,title,poster_path,release_date,tier,order,vote_average,added_at,updated_at")
      .eq("user_id", profile.id),
    supabase
      .from("ranked_channels")
      .select("channel_id,title,thumbnail_url,country,tier,order,subscriber_count,added_at,updated_at")
      .eq("user_id", profile.id),
  ]);

  const titles: RankedTitle[] = ((titlesRes.data ?? []) as PublicTitleRow[]).map((r) => ({
    tmdbId: r.tmdb_id,
    mediaType: r.media_type,
    title: r.title,
    posterPath: r.poster_path,
    releaseDate: r.release_date,
    tier: r.tier,
    order: r.order,
    voteAverage: r.vote_average ?? undefined,
    addedAt: r.added_at,
    updatedAt: r.updated_at,
  }));

  const channels: RankedChannel[] = ((channelsRes.data ?? []) as PublicChannelRow[]).map((r) => ({
    channelId: r.channel_id,
    title: r.title,
    thumbnailUrl: r.thumbnail_url,
    country: r.country,
    tier: r.tier,
    order: r.order,
    subscriberCount: r.subscriber_count ?? undefined,
    addedAt: r.added_at,
    updatedAt: r.updated_at,
  }));

  return { profile, titles, channels };
}
