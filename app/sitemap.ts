import type { MetadataRoute } from "next";
import {
  absoluteUrl,
  PROFILE_CHANGE_FREQUENCY,
  PROFILE_PRIORITY,
  SITEMAP_ROUTES,
} from "@/lib/seo/site";
import { listPublicProfiles } from "@/lib/supabase/public-read";

/**
 * Regenerated hourly rather than pinned to a deploy.
 *
 * Published profiles are the part of this site a search engine has any reason
 * to index — they are the only pages holding content that exists nowhere else —
 * and they appear between releases. A sitemap frozen at build time would not
 * mention anyone who signed up since.
 */
export const revalidate = 3600;

/**
 * Stamped once, at module scope, for the static routes only.
 *
 * What changes those pages is a deploy, so build time is the honest answer.
 * Profiles carry their own `updated_at` instead, which is better data than any
 * timestamp this file could invent.
 */
const lastModified = new Date();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = SITEMAP_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  // Returns an empty list rather than throwing when Supabase is unreachable or
  // unconfigured, so the static half of the sitemap still ships.
  const profiles = await listPublicProfiles();

  return [
    ...staticRoutes,
    ...profiles.map((profile) => ({
      url: absoluteUrl(`/u/${encodeURIComponent(profile.username)}`),
      lastModified: profile.updatedAt,
      changeFrequency: PROFILE_CHANGE_FREQUENCY,
      priority: PROFILE_PRIORITY,
    })),
  ];
}
