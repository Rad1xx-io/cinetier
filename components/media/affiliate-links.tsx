"use client";

import { ExternalLink } from "lucide-react";
import { trackAffiliateClicked } from "@/lib/analytics/events";
import { affiliateLinkList } from "@/lib/utils/affiliate-url";
import { cn } from "@/lib/utils/cn";

interface AffiliateLinksProps {
  titleId: string;
  titleName: string;
  links: Record<string, string> | null | undefined;
  className?: string;
}

/**
 * "Where to watch" — a row of outbound links to streaming services.
 *
 * Rendered as real anchors rather than buttons calling `window.open`: these are
 * links, and a scripted open loses middle-click, cmd-click and dies to a popup
 * blocker. `noopener` matters more than usual here, since the destination is
 * paid to receive the traffic and should not get a handle on this tab.
 */
export function AffiliateLinks({ titleId, titleName, links, className }: AffiliateLinksProps) {
  // Validated at the render site, not trusted from the caller: a stored record
  // is data, and a badge is a claim about where it leads.
  const valid = affiliateLinkList(links);
  if (valid.length === 0) return null;

  return (
    <section className={cn("mt-4", className)}>
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Где смотреть</h2>

      <ul className="mt-2 flex flex-wrap gap-2">
        {valid.map((link) => (
          <li key={link.providerId}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() =>
                trackAffiliateClicked({
                  titleId,
                  titleName,
                  provider: link.providerId,
                  url: link.url,
                })
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 text-xs font-medium transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {link.label}
              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
            </a>
          </li>
        ))}
      </ul>

      {/* Required by law in several places TierListOnline is read from, and the honest
          thing to say regardless — the reader is entitled to know the link earns. */}
      <p className="mt-1.5 text-[11px] text-muted">
        Переходы по этим ссылкам могут приносить TierListOnline комиссию. На цену для вас это не влияет.
      </p>
    </section>
  );
}
