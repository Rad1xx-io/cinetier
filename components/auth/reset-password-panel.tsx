"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, KeyRound, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "done" }
  | { kind: "error"; message: string };

/**
 * Where `resetPasswordForEmail`'s link lands, by way of the existing
 * `/auth/callback` — which already exchanges the code for a session and is
 * unchanged for this; the only new thing this route needed was somewhere to
 * send `redirect_to` afterward. A recovery session reads as an ordinary
 * signed-in one to `useSupabaseSession`, which is what `user` below is
 * actually checking: not "did a password reset start", but "is there a
 * session at all" — an expired or already-used link comes back through
 * `/auth/auth-code-error` before this component ever mounts, and a visitor
 * who lands here any other way without a session sees the same message a
 * broken link would.
 */
export function ResetPasswordPanel() {
  const { configured, loading, user } = useSupabaseSession();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  if (!configured) {
    return <p className="text-sm text-muted">Cloud accounts are not configured.</p>;
  }

  if (loading) {
    return <p className="text-sm text-muted">Checking your link…</p>;
  }

  if (!user) {
    return (
      <div>
        <p className="flex items-center gap-1.5 text-sm text-tier-s">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          This link is invalid or has expired.
        </p>
        <p className="mt-2 text-sm text-muted">
          Request a new one from the sign-in menu&rsquo;s &ldquo;Forgot password?&rdquo; link.
        </p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    );
  }

  if (status.kind === "done") {
    return (
      <div>
        <p className="flex items-center gap-1.5 text-sm text-accent">
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          Password updated.
        </p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/">Continue to TierListOnline</Link>
        </Button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.auth.updateUser({ password });
    setStatus(error ? { kind: "error", message: error.message } : { kind: "done" });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        aria-label="New password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <Button type="submit" disabled={status.kind === "saving"}>
        <KeyRound className="h-4 w-4" aria-hidden />
        Set new password
      </Button>
      {status.kind === "error" && (
        <p className="flex items-center gap-1.5 text-sm text-tier-s">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {status.message}
        </p>
      )}
    </form>
  );
}
