import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * An anonymous, session-less Supabase client for things the server renders the
 * same way for everybody.
 *
 * Deliberately not `getSupabaseServerClient`: that one reads `cookies()`, which
 * would tie a sitemap to whoever happened to request it and force the route to
 * be rendered per visitor. Nothing here depends on who is asking, and RLS is
 * what decides what comes back either way.
 */
function getPublicClient() {
  if (!isSupabaseConfigured()) return null;
  const { url, anonKey } = getSupabaseEnv();
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface PublicProfileRef {
  username: string;
  /** The profile's own `updated_at`, so the sitemap can date each entry truthfully. */
  updatedAt: Date;
}

/**
 * Sitemaps cap at 50,000 URLs. This sits far below that while still being more
 * profiles than the app is likely to hold for a long while; the ordering below
 * makes sure it is the freshest ones that survive the cut if it is ever hit.
 */
export const PUBLIC_PROFILE_LIMIT = 10_000;

/**
 * Every profile its owner chose to publish.
 *
 * Never throws. A sitemap that 500s is worse than a short one: the static
 * routes are still worth serving when the database is unreachable, and a build
 * must not fail because Supabase was slow for a moment.
 */
export async function listPublicProfiles(
  limit = PUBLIC_PROFILE_LIMIT
): Promise<PublicProfileRef[]> {
  const supabase = getPublicClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("username,updated_at")
      // `is_public` is the owner's own switch. The select policy on this table
      // is open, so the filter has to be explicit — RLS will not do it here.
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return (data as { username: string; updated_at: string | null }[]).flatMap((row) => {
      if (!row.username) return [];
      const updated = row.updated_at ? new Date(row.updated_at) : null;
      return [
        {
          username: row.username,
          // A row written before `updated_at` had a default would otherwise
          // produce `Invalid Date` and an unparseable <lastmod>.
          updatedAt: updated && !Number.isNaN(updated.getTime()) ? updated : new Date(),
        },
      ];
    });
  } catch {
    return [];
  }
}
