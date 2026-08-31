import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Sign-in failed — TierListOnline",
};

/**
 * The complete set of things this page will say, keyed by the codes
 * app/auth/callback/route.ts is allowed to send.
 *
 * A lookup with no fallback, deliberately. This used to read
 * `REASONS[raw] ?? raw`, so an unrecognised value was printed as-is — which
 * meant the page rendered whatever the callback had put in the query string,
 * and the callback was putting Supabase's internal error text there. Two
 * separate problems met in that `?? raw`: the provider's words became public,
 * and anybody could put a sentence of their own choosing on a page of this
 * site by linking to it with a made-up `reason`.
 */
const REASONS: Record<string, string> = {
  "no-code": "The sign-in link is incomplete — it carries no confirmation code.",
  "not-configured": "Cloud accounts are not configured on this deployment.",
  "exchange-failed":
    "That sign-in link could not be confirmed. It may have already been used, expired, or been opened in a different browser from the one that requested it.",
};

/**
 * Where the callback sends a failed exchange. Without this the failure was
 * invisible: the user was redirected into the app as if sign-in had worked and
 * simply stayed logged out.
 */
export default async function AuthCodeErrorPage(props: PageProps<"/auth/auth-code-error">) {
  const { reason } = await props.searchParams;
  const raw = Array.isArray(reason) ? reason[0] : reason;
  // No `?? raw`: an unrecognised code says nothing rather than repeating
  // itself back. The paragraph above the detail already explains the common
  // case, so an unknown reason degrades to that rather than to silence.
  const detail = raw ? (REASONS[raw] ?? null) : null;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <TriangleAlert className="h-10 w-10 text-tier-s" aria-hidden />
      <h1 className="text-lg font-semibold">Could not complete sign-in</h1>
      <p className="text-sm text-muted">
        A sign-in link works once and not for long — if you opened it twice, or after a
        while, request a new one.
      </p>
      {detail && (
        <p className="max-w-sm break-words rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
          {detail}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/settings">Try again</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
