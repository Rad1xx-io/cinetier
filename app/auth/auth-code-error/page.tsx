import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Sign-in failed — TierListOnline",
};

const REASONS: Record<string, string> = {
  "no-code": "The sign-in link is incomplete — it carries no confirmation code.",
  "not-configured": "Cloud accounts are not configured on this deployment.",
};

/**
 * Where the callback sends a failed exchange. Without this the failure was
 * invisible: the user was redirected into the app as if sign-in had worked and
 * simply stayed logged out.
 */
export default async function AuthCodeErrorPage(props: PageProps<"/auth/auth-code-error">) {
  const { reason } = await props.searchParams;
  const raw = Array.isArray(reason) ? reason[0] : reason;
  const detail = raw ? (REASONS[raw] ?? raw) : null;

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
