import type { TierOrUnrated } from "@/lib/types";
import { TIER_META } from "@/lib/tier-meta";

/** Maps a tier to the CSS custom properties defined in globals.css. */
export function tierColorVar(tier: TierOrUnrated): string {
  return `var(--tier-${tier.toLowerCase()})`;
}

/** e.g. "S — Шедевры" / "Не оценено". */
export function tierLabel(tier: TierOrUnrated): string {
  return tier === "Unrated" ? TIER_META.Unrated.name : `${tier} — ${TIER_META[tier].name}`;
}
