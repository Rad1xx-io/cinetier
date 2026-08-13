/**
 * The one visual definition of a filter control, shared by every catalog so the
 * panels on /discover, /anime, /games and /youtube stay identical as they drift
 * apart in content.
 */
export const FILTER_SELECT_CLASS =
  "h-10 shrink-0 rounded-lg border border-border bg-surface/80 px-3 text-sm font-medium text-foreground backdrop-blur transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** Sticky, translucent shell that holds a filter row below the page heading. */
export const FILTER_BAR_CLASS =
  "sticky top-14 z-20 -mx-4 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur md:top-16 md:mx-0 md:rounded-xl md:border md:px-4";
