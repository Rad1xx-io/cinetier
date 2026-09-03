"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, KeyRound, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type HasPasswordState = { kind: "loading" } | { kind: "known"; hasPassword: boolean } | { kind: "error" };
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "done" } | { kind: "error"; message: string };

/**
 * Where `/api/account/request-password-change`'s link lands — the same
 * `/auth/callback` exchange `/auth/reset-password` already rides, so a
 * recovery session reads as an ordinary signed-in one to
 * `useSupabaseSession` here too. Deliberately its own component rather than
 * reusing `ResetPasswordPanel`: a reset never asks for the old password
 * (the whole point is not having it), a change always does when there is
 * one — different enough flows to be worth keeping apart even though both
 * ride the identical recovery-session mechanism.
 */
export function ChangePasswordPanel() {
  const { configured, loading, user } = useSupabaseSession();
  const [hasPasswordState, setHasPasswordState] = useState<HasPasswordState>({ kind: "loading" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase
      .rpc("account_has_password")
      .then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
        if (cancelled) return;
        setHasPasswordState(error ? { kind: "error" } : { kind: "known", hasPassword: data === true });
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Every branch below owns its own <h1> — the page component around this
  // panel deliberately has none, since only this panel knows enough (the
  // recovery session, and once loaded, hasPasswordState) to pick the right
  // word. A static page-level title is what caused "Change password" as
  // the page heading next to a "Set password" button in the first place.

  if (!configured) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Password</h1>
        <p className="mt-2 text-sm text-muted">Cloud accounts are not configured.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Password</h1>
        <p className="mt-2 text-sm text-muted">Checking your link…</p>
      </div>
    );
  }

  // Same handling as ResetPasswordPanel: an expired or already-used link
  // comes back through /auth/auth-code-error before this ever mounts, so
  // landing here with no session at all means the link itself was bad.
  if (!user) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Password</h1>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-tier-s">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          This link is invalid or has expired.
        </p>
        <p className="mt-2 text-sm text-muted">
          Request a new one from Settings&rsquo; &ldquo;Change password&rdquo; button.
        </p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    );
  }

  if (hasPasswordState.kind === "loading") {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Password</h1>
        <p className="mt-2 text-sm text-muted">Checking your account…</p>
      </div>
    );
  }

  if (hasPasswordState.kind === "error") {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Password</h1>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-tier-s">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          Could not load your account. Please refresh and try again.
        </p>
      </div>
    );
  }

  // Reached only once hasPasswordState is "known" — status.kind === "done"
  // below relies on that, since a submission could not have happened before
  // this was known in the first place.
  const hasPassword = hasPasswordState.hasPassword;

  if (status.kind === "done") {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Password</h1>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-accent">
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          {hasPassword ? "Password updated." : "Password set."} Other signed-in devices have been
          signed out.
        </p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/settings">Continue to Settings</Link>
        </Button>
      </div>
    );
  }

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    setStatus({ kind: "saving" });

    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hasPassword ? { currentPassword, newPassword } : { newPassword }),
      });
      if (!res.ok) {
        const parsed = await res.json().catch(() => ({}));
        setStatus({
          kind: "error",
          message: typeof parsed.error === "string" ? parsed.error : "Something went wrong.",
        });
        return;
      }
      setStatus({ kind: "done" });
    } catch {
      setStatus({ kind: "error", message: "Check your connection and try again." });
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        {hasPassword ? "Change your password" : "Set a password"}
      </h1>
      <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
        {hasPassword && (
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
            aria-label="Current password"
            autoComplete="current-password"
            required
          />
        )}
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          aria-label="New password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          aria-label="Confirm new password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Button type="submit" disabled={status.kind === "saving" || mismatch}>
          <KeyRound className="h-4 w-4" aria-hidden />
          {hasPassword ? "Change password" : "Set a password"}
        </Button>
        {mismatch && (
          <p className="flex items-center gap-1.5 text-sm text-tier-s">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            The new passwords don&rsquo;t match.
          </p>
        )}
        {status.kind === "error" && (
          <p className="flex items-center gap-1.5 text-sm text-tier-s">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {status.message}
          </p>
        )}
      </form>
    </div>
  );
}
