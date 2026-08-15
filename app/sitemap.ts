import type { MetadataRoute } from "next";
import { absoluteUrl, SITEMAP_ROUTES } from "@/lib/seo/site";

/**
 * Stamped once, at module scope, rather than per entry inside the loop.
 *
 * These are static pages: what changes them is a deploy, so the build time is
 * the honest answer. Calling `new Date()` per request would tell every crawl
 * that every page had just changed, which search engines learn to discount.
 */
const lastModified = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
