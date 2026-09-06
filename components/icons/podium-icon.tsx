import type { SVGProps } from "react";

/**
 * The brand mark: a podium, short/tall/short.
 *
 * Hand-written rather than picked from `lucide-react`, which does ship a
 * `Podium` icon but not this shape — theirs is a lectern-style illustration
 * (a stepped stand with a flag/plaque on top), not a plain ranking glyph, and
 * it does not hold up at 16px the way three bars do. These three bars are
 * also drawn to the same short/tall/short proportions as `app/icon.svg`'s
 * gold bars, so the header mark and the favicon read as the same shape at
 * two sizes rather than two different icons. It mirrors the lucide API
 * instead of inventing one: same 24x24 viewBox, same `currentColor` stroke at
 * width 2, props spread through — what lets it drop into the header with the
 * classes the previous icon already had.
 */
export function PodiumIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="6" y1="20" x2="6" y2="12" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="15" />
    </svg>
  );
}
