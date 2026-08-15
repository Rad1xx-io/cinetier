import type { MetadataRoute } from "next";
import { absoluteUrl, CRAWLER_DISALLOW, SITE_URL } from "@/lib/seo/site";

/**
 * Open to every crawler, minus the paths that are not pages.
 *
 * `/api/` and `/auth/` return JSON and redirects; `/widgets/` renders the same
 * board as its public profile without the chrome, so indexing it would split
 * one page's ranking across two URLs.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: CRAWLER_DISALLOW,
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
