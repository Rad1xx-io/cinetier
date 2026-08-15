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
  /**
   * `compact` is a badge for a row of other actions; `card` is a block that
   * asks, for the foot of a list someone just read through.
   */
  variant?: "compact" | "card";
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
 *
 * Returns null when there is no usable link, in both variants: an author who
 * set nothing should cost the layout nothing, not an empty box.
 */
export function DonateButton({
  authorId,
  authorName,
  donationUrl,
  tierListId,
  variant = "compact",
  className,
}: DonateButtonProps) {
  // Re-checked at the render site rather than trusted from the caller: this
  // value is typed by one user and clicked by another.
  const href = safeDonationUrl(donationUrl);
  if (!href) return null;

  const host = donationUrlHost(href);
  const report = () => trackDonateClicked(authorId, tierListId);

  if (variant === "card") {
    return (
      <section
        className={cn(
          "flex flex-col items-center gap-3 rounded-2xl border border-tier-s/25 bg-gradient-to-b from-tier-s/10 to-transparent px-6 py-7 text-center",
          className
        )}
      >
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full bg-tier-s/15 text-tier-s"
          aria-hidden
        >
          <Heart className="h-5 w-5 fill-current" />
        </span>

        <div>
          <h2 className="text-base font-semibold">Понравился список?</h2>
          <p className="mt-1 text-sm text-muted">
            Поддержите {authorName} — CineTier не берёт комиссию и не участвует в переводе.
          </p>
        </div>

        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={report}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-tier-s px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tier-s/50"
        >
          <Heart className="h-4 w-4 shrink-0" aria-hidden />
          Поддержать автора
        </a>

        {/* Named before the click, not after: a link that earns should say
            where it lands. */}
        {host && <p className="text-[11px] text-muted">Откроется {host} в новой вкладке</p>}
      </section>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={report}
      title={host ? `Поддержать ${authorName} — откроется ${host}` : `Поддержать ${authorName}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-tier-s focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tier-s/50",
        className
      )}
    >
      <Heart className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Поддержать
    </a>
  );
}
