import Link from "next/link";
import { Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * What a catalogue detail page shows when the rate limiter refuses it.
 *
 * Deliberately not the "could not load" error the same pages show for an
 * upstream failure. Nothing is broken here and nothing needs reporting — the
 * request was declined on purpose and the same url works again shortly, so the
 * page says that rather than implying a fault.
 *
 * Shared by all three catalogues because the situation is identical in each;
 * only the way back differs.
 */
export function CatalogueBusy({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <Hourglass className="h-10 w-10 text-muted" aria-hidden />
      <h1 className="text-lg font-semibold">Too many requests</h1>
      <p className="text-sm text-muted">
        This page is being opened faster than we can look things up. Please wait a moment and try
        again.
      </p>
      <Button asChild variant="secondary">
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </div>
  );
}
