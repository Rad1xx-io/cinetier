"use client";

import { Heart } from "lucide-react";
import { trackDonateClicked } from "@/lib/analytics/events";
import { donationUrlHost, safeDonationUrl } from "@/lib/utils/donation-url";
import { cn } from "@/lib/utils/cn";

interface DonateButtonProps {
  /** Who gets the money — reported with the event, never shown. */
  authorId: string;
  authorName: string;
  donationUrl: string | null | undefined;
  /** Which board the visitor was looking at, when that is knowable. */
  tierListId?: string;
  className?: string;
}

/**
 * Sends a visitor to wherever the author collects support.
 *
 * CineTier handles no money and sees no payment: this is a link out to Boosty,
 * CloudTips, Patreon or similar, so the only thing worth measuring here is the
 * click. Rendered as an anchor rather than a button with `window.open` — a real
 * link survives middle-click, cmd-click and a popup blocker, all of which a
 * scripted `open()` quietly loses.
 */
export function DonateButton({
  authorId,
  authorName,
  donationUrl,
  tierListId,
  className,
}: DonateButtonProps) {
  // Re-checked at the render site rather than trusted from the caller: this
  // value is typed by one user and clicked by another.
  const href = safeDonationUrl(donationUrl);
  if (!href) return null;

  const host = donationUrlHost(href);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackDonateClicked(authorId, tierListId)}
      title={host ? `Открыть ${host} в новой вкладке` : undefined}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border border-tier-s/30 bg-tier-s/10 px-3 text-xs font-medium text-tier-s transition-colors hover:bg-tier-s/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tier-s/50",
        className
      )}
    >
      <Heart className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">Поддержать {authorName}</span>
    </a>
  );
}
