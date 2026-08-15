"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the site's own furniture on widget routes.
 *
 * A widget is embedded in OBS as a browser source, where a nav bar and a footer
 * are not chrome but clutter on someone's broadcast. The root layout applies to
 * every route in the App Router and cannot be opted out of without moving the
 * whole app into a route group, so the chrome checks the path instead.
 *
 * `usePathname` resolves to the same value on the server render and the client
 * hydration, so nothing here can mismatch.
 */
export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/widgets")) return null;
  return <>{children}</>;
}
