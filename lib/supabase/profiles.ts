"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeDonationUrl } from "@/lib/utils/donation-url";
import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import type { CriterionScore } from "@/lib/types/criteria";

export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
  isPublic: boolean;
  /** Whether visitors may copy this list onto their own board. */
  allowFork: boolean;
  /** Where "support the author" leads. Null when the author set nothing. */
  donationUrl: string | null;
}

interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  is_public: boolean;
  allow_fork?: boolean | null;
  donation_url?: string | null;
}

function fromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isPublic: row.is_public,
    // Defaulted rather than required: a profile row written before migration 008
    // has no column to read, and forking was allowed for everyone until then.
    allowFork: row.allow_fork ?? true,
    // Re-validated on the way out, not just on the way in: a row written before
    // the CHECK constraint existed could still hold something unopenable.
    donationUrl: safeDonationUrl(row.donation_url),
  };
}

/** Mirrors the CHECK constraint in migration 004 so the UI rejects the same values the database would. */
export const USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;

export function validateUsername(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value.length < 3) return "At least 3 characters.";
  if (value.length > 20) return "At most 20 characters.";
  if (!USERNAME_PATTERN.test(value)) {
    return "Latin letters, digits, hyphen and underscore only.";
  }
  return null;
}

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name,is_public,allow_fork,donation_url")
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
  donationUrl?: string;
}): Promise<SaveProfileResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "Cloud accounts are not configured." };

  const username = input.username.trim().toLowerCase();
  const invalid = validateUsername(username);
  if (invalid) return { ok: false, error: invalid };

  // An unusable link is rejected rather than silently dropped — saving without
  // a word would leave the author believing their support button is up.
  const rawDonation = input.donationUrl?.trim() ?? "";
  const donationUrl = rawDonation ? safeDonationUrl(rawDonation) : null;
  if (rawDonation && !donationUrl) {
    return { ok: false, error: "The support link must start with https:// and point at a website." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: input.userId,
        username,
        display_name: input.displayName.trim() || null,
        donation_url: donationUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("id,username,display_name,is_public,allow_fork,donation_url")
    .single();

  if (error) {
    // 23505 is Postgres' unique_violation — the only failure worth spelling out.
    const taken = error.code === "23505" || /duplicate key/i.test(error.message);
    return {
      ok: false,
      error: taken ? "That username is taken." : "Could not save the profile.",
    };
  }

  return { ok: true, profile: fromRow(data as ProfileRow) };
}

export interface PublicTierList {
  profile: Profile;
  titles: RankedTitle[];
  channels: RankedChannel[];
}

interface PublicCriterionRow {
  rating_id: string;
  criterion_id: string;
  name: string;
  score: number;
}

interface PublicTitleRow {
  id: string;
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
 * Flips whether visitors may fork this list.
 *
 * Independent of `is_public`: publishing is about who can *see* the list,
 * forking about who can take a copy, and people reasonably want one without
 * the other.
 */
export async function setProfileForkPolicy(
  userId: string,
  allowFork: boolean
): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from("profiles")
    .update({ allow_fork: allowFork, updated_at: new Date().toISOString() })
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
    .select("id,username,display_name,is_public,allow_fork,donation_url")
    .eq("username", username.toLowerCase())
    .maybeSingle();

  if (!profileRow) return null;
  const profile = fromRow(profileRow as ProfileRow);
  if (!profile.isPublic) return null;

  const [titlesRes, channelsRes, criteriaRes] = await Promise.all([
    supabase
      .from("ranked_titles")
      // `id` comes along so the criteria rows below can be matched back to their
      // title; it is dropped again in the mapping and never leaves this function.
      .select("id,tmdb_id,media_type,title,poster_path,release_date,tier,order,vote_average,added_at,updated_at")
      .eq("user_id", profile.id),
    supabase
      .from("ranked_channels")
      .select("channel_id,title,thumbnail_url,country,tier,order,subscriber_count,added_at,updated_at")
      .eq("user_id", profile.id),
    // One query for the whole list rather than one per title: a shared page is
    // read start to finish, so there is nothing to defer here.
    supabase
      .from("criteria_scores")
      .select("rating_id,criterion_id,name,score")
      .eq("user_id", profile.id),
  ]);

  const criteriaByRating = new Map<string, CriterionScore[]>();
  for (const row of (criteriaRes.data ?? []) as PublicCriterionRow[]) {
    const list = criteriaByRating.get(row.rating_id) ?? [];
    list.push({ criterionId: row.criterion_id, name: row.name, score: row.score });
    criteriaByRating.set(row.rating_id, list);
  }

  const titles: RankedTitle[] = ((titlesRes.data ?? []) as PublicTitleRow[]).map((r) => ({
    ...(criteriaByRating.has(r.id) ? { criteriaScores: criteriaByRating.get(r.id) } : {}),
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
