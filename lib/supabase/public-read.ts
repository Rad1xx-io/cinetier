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
 * How much of a board makes a page worth offering a search engine.
 *
 * One entry is the literal reading of "not empty". Raise it to 3–5 if the index
 * starts filling with near-empty boards: a page holding a single poster is thin
 * content, and enough of them drags down the pages that are not.
 */
export const MIN_SITEMAP_BOARD_ITEMS = 1;

interface ProfileRow {
  username: string;
  updated_at: string | null;
}

function toRef(row: ProfileRow): PublicProfileRef[] {
  if (!row.username) return [];
  const updated = row.updated_at ? new Date(row.updated_at) : null;
  return [
    {
      username: row.username,
      // A row written before `updated_at` had a default would otherwise produce
      // `Invalid Date` and an unparseable <lastmod>.
      updatedAt: updated && !Number.isNaN(updated.getTime()) ? updated : new Date(),
    },
  ];
}

type Client = NonNullable<ReturnType<typeof getPublicClient>>;

/**
 * The path taken before migration 011 has been applied: every published
 * profile, empty boards included.
 *
 * Kept as a fallback rather than removed, because the alternative on a database
 * still missing the view is a sitemap with no profiles in it at all — strictly
 * worse than one carrying a few thin pages.
 */
async function listWithoutCounts(client: Client, limit: number): Promise<PublicProfileRef[]> {
  const { data, error } = await client
    .from("profiles")
    .select("username,updated_at")
    // `is_public` is the owner's own switch. The select policy on this table is
    // open, so the filter has to be explicit — RLS will not do it here.
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as ProfileRow[]).flatMap(toRef);
}

/**
 * Published profiles whose board actually holds something.
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
      .from("public_profile_sitemap")
      .select("username,updated_at,items_count")
      // The view already filters on is_public; this is the empty-board cut.
      .gte("items_count", MIN_SITEMAP_BOARD_ITEMS)
      .order("updated_at", { ascending: false })
      .limit(limit);

    // 42P01 is Postgres' undefined_table, which here means migration 011 has
    // not been run yet. Anything else is a real failure and gets the same
    // treatment as an outage.
    if (error?.code === "42P01" || error?.message?.includes("public_profile_sitemap")) {
      return listWithoutCounts(supabase, limit);
    }
    if (error || !data) return [];

    return (data as ProfileRow[]).flatMap(toRef);
  } catch {
    return [];
  }
}
