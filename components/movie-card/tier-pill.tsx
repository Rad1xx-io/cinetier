import type { TierOrUnrated } from "@/lib/types";
import { tierColorVar } from "@/lib/utils/tier-style";
import { cn } from "@/lib/utils/cn";

export function TierPill({ tier, className }: { tier: TierOrUnrated; className?: string }) {
  const isUnrated = tier === "Unrated";
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold",
        isUnrated ? "text-muted" : "text-background",
        className
      )}
      style={{ backgroundColor: isUnrated ? "transparent" : tierColorVar(tier) }}
    >
      {isUnrated ? "—" : tier}
    </span>
  );
}
