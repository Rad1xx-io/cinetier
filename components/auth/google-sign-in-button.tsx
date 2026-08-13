"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * The official four-colour mark, inlined as SVG.
 *
 * lucide-react dropped its brand icons in v1, and Google's terms require the
 * logo be shown in its own colours rather than recoloured to match the app, so
 * this stays a literal asset instead of an icon component.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4 shrink-0" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

interface GoogleSignInButtonProps {
  /** Where to land after the exchange, matching MagicLinkForm's behaviour. */
  redirectTo?: string;
}

export function GoogleSignInButton({ redirectTo = "/" }: GoogleSignInButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setPending(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Same callback the magic link uses, carrying the destination along so
        // both sign-in routes land in the same place rather than one of them
        // dropping the user on /settings.
        redirectTo: `${window.location.origin}/auth/callback?redirect_to=${encodeURIComponent(redirectTo)}`,
      },
    });

    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }
    // On success the browser is navigating to Google — leave the button
    // disabled rather than flicking it back to its idle state mid-redirect.
  }

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        onClick={handleClick}
        disabled={pending}
        className="w-full justify-center"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <GoogleMark />}
        Войти через Google
      </Button>
      {error && <p className="mt-2 text-sm text-tier-s">{error}</p>}
    </div>
  );
}
