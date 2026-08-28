"use client";

import { useState } from "react";
import { Check, Mail, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { trackSignupStarted } from "@/lib/analytics/events";

type SendStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

interface MagicLinkFormProps {
  /** Where the auth callback route redirects back to once the link is clicked. */
  redirectTo?: string;
}

/**
 * The one and only sign-in flow: a passwordless email magic link. Supabase's
 * signInWithOtp creates the account automatically on first use, so this same
 * form serves both "log in" and "register" — there is no separate password
 * registration step to duplicate. Shared between the Settings account panel
 * and the header's auth popover so there's exactly one implementation.
 */
export function MagicLinkForm({ redirectTo = "/" }: MagicLinkFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SendStatus>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setStatus({ kind: "sending" });
    // Fired on the attempt, not the result: a rejected address or a network
    // drop still says somebody tried, which is the top-of-funnel fact.
    trackSignupStarted(window.location.pathname);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Deliberately the live origin, not the canonical site URL: sign-in has
        // to come back to the host the visitor is on, or a session started on
        // localhost or a preview would be handed to production and lost.
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect_to=${encodeURIComponent(redirectTo)}`,
      },
    });
    setStatus(error ? { kind: "error", message: error.message } : { kind: "sent", email });
  }

  return (
    <div>
      {/* Google first: it is one click, while the email route costs a trip to
          the inbox. Both create the account on first use, so neither is a
          separate "registration". */}
      <GoogleSignInButton redirectTo={redirectTo} />

      <div className="my-3 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted">or by email</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="sm:max-w-xs"
          aria-label="Email address"
        />
        <Button type="submit" disabled={status.kind === "sending"}>
          <Mail className="h-4 w-4" aria-hidden />
          Send me a link
        </Button>
      </form>
      {status.kind === "sent" && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-accent">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Link sent to {status.email}. Check your inbox.
        </p>
      )}
      {status.kind === "error" && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-tier-s">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {status.message}
        </p>
      )}
    </div>
  );
}
