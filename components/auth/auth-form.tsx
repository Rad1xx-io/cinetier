"use client";

import { useState } from "react";
import { Check, KeyRound, Mail, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { refreshSessionFromCookies } from "@/lib/supabase/session-store";
import { saveProfile, validateUsername } from "@/lib/supabase/profiles";
import { armPasswordSignup } from "@/lib/analytics/signup";
import { trackSignupStarted } from "@/lib/analytics/events";

type SendStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

interface AuthFormProps {
  /** Where the auth callback route redirects back to once the link is clicked. */
  redirectTo?: string;
}

/**
 * Every way in: a passwordless email magic link, Google, and — the third
 * door, added 2026-09-03 — an email or username with a password. Shared
 * between the Settings account panel and the header's auth popover so
 * there's exactly one implementation each of the three carries.
 *
 * Supabase's signInWithOtp still creates the account automatically on first
 * use, so the magic-link block below is unchanged from when this component
 * was `MagicLinkForm` — nobody who already uses that door, or Google, loses
 * anything. The password door is collapsed behind its own toggle rather than
 * shown open by default: it is a third option, not a replacement, and
 * keeping it one click away is what lets the popover stay exactly as small
 * as it already was for the two people who already know they want the
 * button above.
 */
export function AuthForm({ redirectTo = "/" }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SendStatus>({ kind: "idle" });
  const [passwordOpen, setPasswordOpen] = useState(false);

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

      {passwordOpen ? (
        <div className="mt-3 border-t border-border pt-3">
          <PasswordAuth redirectTo={redirectTo} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPasswordOpen(true)}
          className="mt-3 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          Or sign in with a password
        </button>
      )}
    </div>
  );
}

type PasswordMode = "signin" | "register" | "forgot";

function PasswordAuth({ redirectTo }: { redirectTo: string }) {
  const [mode, setMode] = useState<PasswordMode>("signin");

  if (mode === "register") return <RegisterForm redirectTo={redirectTo} onSwitchMode={setMode} />;
  if (mode === "forgot") return <ForgotPasswordForm onSwitchMode={setMode} />;
  return <SignInForm onSwitchMode={setMode} />;
}

/**
 * POSTs to one of this app's own `/api/auth/*` routes. Both password
 * sign-in and forgot-password resolve the identifier and perform the
 * actual Supabase call entirely server-side now — see either route's own
 * module doc for why: the email an identifier resolves to must never
 * travel back into a response body, so this only ever reads `body.error`
 * on failure or trusts a bare `{ ok: true }` on success, never anything
 * else out of the response.
 */
async function postAuthAction(
  path: string,
  body: Record<string, string>
): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const parsed = await res.json().catch(() => ({}));
      return { error: typeof parsed.error === "string" ? parsed.error : "Something went wrong." };
    }
    return { ok: true };
  } catch {
    return { error: "Check your connection and try again." };
  }
}

type FormStatus = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string };

function SignInForm({ onSwitchMode }: { onSwitchMode: (mode: PasswordMode) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "loading" });
    trackSignupStarted(window.location.pathname);

    const result = await postAuthAction("/api/auth/sign-in", { identifier, password });
    if ("error" in result) {
      setStatus({ kind: "error", message: result.error });
      return;
    }

    /*
     * The session now lives in cookies the server just wrote — nothing on
     * this browser client's own side triggered it, so nothing would
     * otherwise notice. This is what makes AuthArea/AccountPanel actually
     * swap this whole form out for the signed-in view without a manual
     * reload, the same as they already do after Google or a magic link
     * (both of which DO run through this browser client directly, which is
     * why they never needed this extra step). See
     * refreshSessionFromCookies's own doc for why a plain getSession() call
     * on its own would not be enough either.
     */
    await refreshSessionFromCookies();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Input
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="Email or username"
        aria-label="Email or username"
        autoComplete="username"
        required
      />
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        aria-label="Password"
        autoComplete="current-password"
        required
      />
      <Button type="submit" disabled={status.kind === "loading"}>
        <KeyRound className="h-4 w-4" aria-hidden />
        Sign in
      </Button>
      {status.kind === "error" && (
        <p className="flex items-center gap-1.5 text-sm text-tier-s">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {status.message}
        </p>
      )}
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => onSwitchMode("forgot")}
          className="text-muted hover:text-foreground hover:underline"
        >
          Forgot password?
        </button>
        <button
          type="button"
          onClick={() => onSwitchMode("register")}
          className="text-muted hover:text-foreground hover:underline"
        >
          Create an account
        </button>
      </div>
    </form>
  );
}

function RegisterForm({
  redirectTo,
  onSwitchMode,
}: {
  redirectTo: string;
  onSwitchMode: (mode: PasswordMode) => void;
}) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    FormStatus | { kind: "check-email"; email: string }
  >({ kind: "idle" });

  const usernameError = username ? validateUsername(username) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (usernameError) return;
    setStatus({ kind: "loading" });

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    // Armed before the call, not after: Supabase reports a password account
    // under the same "email" provider a magic link uses, so this is the only
    // thing that will let SignupTracker credit it correctly. See
    // lib/analytics/signup.ts.
    armPasswordSignup();
    trackSignupStarted(window.location.pathname);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect_to=${encodeURIComponent(redirectTo)}`,
      },
    });

    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    if (!data.user) {
      setStatus({ kind: "error", message: "Could not create the account. Please try again." });
      return;
    }

    if (data.session) {
      /*
       * An immediate session — the common case, and what makes "email +
       * password + username in one step" actually one step. Claiming the
       * username here can still fail on its own (taken by someone else,
       * mainly), and that is not treated as the signup failing: the account
       * is real and signed in either way, exactly as a fresh Google or
       * magic-link account starts out with no username claimed at all,
       * until Settings' own UsernameDialog is used to claim one later. Not
       * shown here regardless of outcome — the session update this
       * triggers unmounts this whole form before a message could be read.
       */
      await saveProfile({ userId: data.user.id, username, displayName: "" });
      return;
    }

    /*
     * No immediate session: this Supabase project has "Confirm email"
     * switched on, so the account exists but is not signed in yet, and
     * nothing can be written to `profiles` without a session (its own
     * insert policy requires auth.uid() = id). The username typed here is
     * not persisted anywhere — claiming it is deferred to Settings, after
     * the confirmation link is clicked.
     */
    setStatus({ kind: "check-email", email });
  }

  if (status.kind === "check-email") {
    return (
      <p className="flex items-center gap-1.5 text-sm text-accent">
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Confirm your account from the email sent to {status.email}, then set your username in
        Settings.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        autoComplete="email"
        required
      />
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted">@</span>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          placeholder="username"
          aria-label="Username"
          autoComplete="off"
          required
        />
      </div>
      {username && !usernameError && (
        <p className="text-xs text-muted">Link: /u/{username}</p>
      )}
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        aria-label="Password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <Button type="submit" disabled={status.kind === "loading" || Boolean(usernameError)}>
        <KeyRound className="h-4 w-4" aria-hidden />
        Create account
      </Button>
      {(usernameError || status.kind === "error") && (
        <p className="flex items-center gap-1.5 text-sm text-tier-s">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {usernameError ?? (status.kind === "error" ? status.message : "")}
        </p>
      )}
      <button
        type="button"
        onClick={() => onSwitchMode("signin")}
        className="text-left text-xs text-muted hover:text-foreground hover:underline"
      >
        Already have an account? Sign in
      </button>
    </form>
  );
}

function ForgotPasswordForm({ onSwitchMode }: { onSwitchMode: (mode: PasswordMode) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [status, setStatus] = useState<FormStatus | { kind: "sent" }>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "loading" });

    // Resolution and the actual resetPasswordForEmail call both happen
    // server-side now — see app/api/auth/forgot-password/route.ts's own
    // doc. The route always answers { ok: true } once past validation and
    // the rate limiter, whether or not the identifier resolved to a real
    // account, so this "sent" state below is genuinely the only outcome a
    // legitimate request reaches — there's nothing left to distinguish.
    const result = await postAuthAction("/api/auth/forgot-password", { identifier });
    if ("error" in result) {
      setStatus({ kind: "error", message: result.error });
      return;
    }
    setStatus({ kind: "sent" });
  }

  if (status.kind === "sent") {
    return (
      <div>
        {/* Deliberately vague about whether an account exists — the same
            thing signInWithOtp already does for every address, whether or
            not it belongs to anyone. Now enforced by the server response
            itself (see the route this form calls), not only by this copy
            always being what gets shown. */}
        <p className="flex items-center gap-1.5 text-sm text-accent">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
          If an account exists for that email, a reset link is on its way. Check your inbox.
        </p>
        <button
          type="button"
          onClick={() => onSwitchMode("signin")}
          className="mt-2 text-xs text-muted hover:text-foreground hover:underline"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <p className="text-xs text-muted">We&rsquo;ll email you a link to set a new password.</p>
      <Input
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="Email or username"
        aria-label="Email or username"
        autoComplete="username"
        required
      />
      <Button type="submit" disabled={status.kind === "loading"}>
        <Mail className="h-4 w-4" aria-hidden />
        Send reset link
      </Button>
      {status.kind === "error" && (
        <p className="flex items-center gap-1.5 text-sm text-tier-s">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {status.message}
        </p>
      )}
      <button
        type="button"
        onClick={() => onSwitchMode("signin")}
        className="text-left text-xs text-muted hover:text-foreground hover:underline"
      >
        Back to sign in
      </button>
    </form>
  );
}
