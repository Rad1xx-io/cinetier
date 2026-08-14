"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics/events";

/**
 * Reports a view on every route change.
 *
 * Mounted once in the root layout and renders nothing, so it costs no markup
 * and re-renders only when the path itself changes — a component that returned
 * UI here would drag the whole tree along with each navigation.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    // The App Router can re-run this for the same path (search-param changes,
    // Fast Refresh); a page view should follow the path, not the render.
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
