/**
 * One place for the facts about where this site lives.
 *
 * The sitemap, robots.txt and the document's own metadata all need the same
 * origin, and three copies of a hostname is how a domain change ships half
 * done. Overridable by env so a preview deployment can advertise its own URL
 * instead of claiming to be production.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://tierlistonline.com"
).replace(/\/+$/, "");

/**
 * The bare hostname, for the places that show the address rather than link to
 * it — the export watermark, where a protocol would only be noise.
 */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

/**
 * The token from Google Search Console. Left empty until one is issued: an
 * empty verification tag is worse than none, since it looks configured while
 * verifying nothing.
 */
export const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? "";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * A link built to be handed to someone else.
 *
 * Deliberately not `window.location.origin`: a link copied from a preview
 * deployment would carry that deployment's hostname, which stops resolving the
 * moment the preview is torn down. Whoever receives it should land on the real
 * site, wherever it was copied from.
 *
 * Sign-in redirects are the opposite case and must keep using the live origin —
 * see the note in the auth components.
 */
export function shareUrl(path: string): string {
  return absoluteUrl(path);
}

export interface SitemapRoute {
  path: string;
  changeFrequency: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
}

/**
 * The pages worth offering a crawler, with the paths this app actually serves —
 * films live at `/discover`, not `/movies`.
 *
 * Deliberately absent: `/settings` and `/profile` (nothing to see without a
 * session), `/widgets/*` (a chromeless copy of a board that would compete with
 * the real page for the same content), `/battle/*` (the link is the invitation),
 * and `/u/*` (real content, but one query per profile — worth adding once the
 * sitemap is allowed to read the database).
 */
export const SITEMAP_ROUTES: SitemapRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/feed", changeFrequency: "daily", priority: 0.9 },
  { path: "/discover", changeFrequency: "daily", priority: 0.8 },
  { path: "/anime", changeFrequency: "daily", priority: 0.8 },
  { path: "/games", changeFrequency: "daily", priority: 0.8 },
  { path: "/youtube", changeFrequency: "daily", priority: 0.8 },
  // The boards themselves. A visitor with no account sees an empty state and a
  // way in, which is a real landing page rather than a dead one.
  { path: "/tier-list", changeFrequency: "weekly", priority: 0.7 },
  { path: "/youtube/tier-list", changeFrequency: "weekly", priority: 0.6 },
];

/**
 * Published profiles, added to the sitemap at request time from the database.
 *
 * Ranked below the catalogue pages but above nothing: these hold content that
 * exists nowhere else on the web, which is more than the catalogues can say.
 * `weekly` matches how a board actually moves — people add a few titles and
 * leave it for a while.
 */
export const PROFILE_PRIORITY = 0.7;
export const PROFILE_CHANGE_FREQUENCY = "weekly" as const;

/** Routes that are not pages, or are pages no search result should land on. */
export const CRAWLER_DISALLOW = ["/api/", "/auth/", "/widgets/"];
