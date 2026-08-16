import type { MetadataRoute } from "next";
import {
  absoluteUrl,
  PROFILE_CHANGE_FREQUENCY,
  PROFILE_PRIORITY,
  SITEMAP_ROUTES,
} from "@/lib/seo/site";
import {
  listPublicProfiles,
  listRankedChannels,
  listRankedEntries,
  type RankedEntryRef,
} from "@/lib/supabase/public-read";

/**
 * Regenerated hourly rather than pinned to a deploy.
 *
 * The dynamic half grows as people rank things, and a sitemap frozen at build
 * time would not mention anything added since the last release.
 */
export const revalidate = 3600;

/**
 * Stamped once, at module scope, for the static routes only.
 *
 * What changes those pages is a deploy, so build time is the honest answer.
 * Everything below carries its own `updated_at`, which is better data than any
 * timestamp this file could invent.
 */
const lastModified = new Date();

/**
 * A detail page is a view onto a catalogue entry, and the catalogue changes
 * under us — a rating moves, a poster is replaced. Weekly says "worth another
 * look" without claiming daily churn we cannot see.
 */
const ENTRY_CHANGE_FREQUENCY = "weekly" as const;
const ENTRY_PRIORITY = 0.8;

function entryUrls(prefix: string, entries: RankedEntryRef[]): MetadataRoute.Sitemap {
  return entries.map((entry) => ({
    url: absoluteUrl(`${prefix}/${encodeURIComponent(entry.slug)}`),
    lastModified: entry.updatedAt,
    changeFrequency: ENTRY_CHANGE_FREQUENCY,
    priority: ENTRY_PRIORITY,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = SITEMAP_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  /*
   * Three queries, run together, and none of them per-item. Each loader
   * swallows its own failure and answers with an empty list, so a slow or
   * unreachable database costs the dynamic half rather than the whole file.
   *
   * Deliberately absent: /battle/[id]. Battles have no public flag — migration
   * 006 makes the uuid itself the access check, "the link is the invitation".
   * Listing every battle id here would hand anyone the whole set and undo that.
   */
  const [profiles, entries, channels] = await Promise.all([
    listPublicProfiles(),
    listRankedEntries(),
    listRankedChannels(),
  ]);

  return [
    ...staticRoutes,
    ...entryUrls("/title", entries.titles),
    ...entryUrls("/anime", entries.anime),
    ...entryUrls("/games", entries.games),
    ...entryUrls("/youtube/channel", channels),
    ...profiles.map((profile) => ({
      url: absoluteUrl(`/u/${encodeURIComponent(profile.username)}`),
      lastModified: profile.updatedAt,
      changeFrequency: PROFILE_CHANGE_FREQUENCY,
      priority: PROFILE_PRIORITY,
    })),
  ];
}
