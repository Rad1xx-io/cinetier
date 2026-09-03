"use client";

import { useState } from "react";
import { Check, KeyRound, LogOut, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthForm } from "@/components/auth/auth-form";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ChangePasswordRequestStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

export function AccountPanel() {
  const { configured, loading, user } = useSupabaseSession();
  const [changePasswordStatus, setChangePasswordStatus] = useState<ChangePasswordRequestStatus>({
    kind: "idle",
  });

  // Cloud accounts aren't set up on this deployment — the app is guest-only,
  // stay silent rather than showing a broken/half-configured account section.
  if (!configured) return null;

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        Checking your session…
      </div>
    );
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
  }

  async function handleRequestPasswordChange() {
    setChangePasswordStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/account/request-password-change", { method: "POST" });
      if (!res.ok) {
        const parsed = await res.json().catch(() => ({}));
        setChangePasswordStatus({
          kind: "error",
          message: typeof parsed.error === "string" ? parsed.error : "Something went wrong.",
        });
        return;
      }
      setChangePasswordStatus({ kind: "sent" });
    } catch {
      setChangePasswordStatus({ kind: "error", message: "Check your connection and try again." });
    }
  }

  if (user) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Account</h2>
        <p className="mt-1 text-sm text-muted">
          Signed in as <span className="text-foreground">{user.email}</span>. Your rankings sync
          to the cloud and follow you to any device.
        </p>
        {changePasswordStatus.kind === "sent" ? (
          // Same pattern ForgotPasswordForm already uses for its own "check
          // your inbox" state — the wording differs (there is no "if an
          // account exists" hedge to keep here: this account is already
          // known, since sending the button's own request required a
          // session), the shape does not.
          <p className="mt-3 flex items-center gap-1.5 text-sm text-accent">
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
            A confirmation link is on its way to your inbox.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={handleSignOut}>
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleRequestPasswordChange()}
              disabled={changePasswordStatus.kind === "sending"}
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden />
              Change password
            </Button>
          </div>
        )}
        {changePasswordStatus.kind === "error" && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-tier-s">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {changePasswordStatus.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Account</h2>
      <p className="mt-1 text-sm text-muted">
        You are browsing as a guest — rankings live only in this browser. Sign in to sync them
        across your devices.
      </p>
      <div className="mt-3">
        <AuthForm redirectTo="/settings" />
      </div>
    </div>
  );
}
