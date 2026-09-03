"use client";

import type { SignupMethod } from "@/lib/analytics/events";

/**
 * Telling a signup apart from a sign-in.
 *
 * Supabase runs both through the same callback and reports the same
 * `SIGNED_IN` event, so nothing in the auth flow says which one happened. What
 * does say it is the account: on the visit that created it, `created_at` and
 * `last_sign_in_at` are stamped moments apart. A month later they are a month
 * apart.
 */

/** The shape this module needs from a Supabase user — so tests need no SDK. */
export interface SignupUserLike {
  id: string;
  created_at?: string;
  last_sign_in_at?: string | null;
  app_metadata?: { provider?: string } | null;
}

/**
 * How far apart the two timestamps may sit and still be the same visit.
 *
 * Generous on purpose: the OAuth round trip goes through Google and back, and
 * a slow hop must not turn a signup into a returning user. A minute is far
 * short of a second session and far longer than any redirect.
 */
export const FIRST_SESSION_WINDOW_MS = 60_000;

export function isFirstSession(user: SignupUserLike): boolean {
  const created = Date.parse(user.created_at ?? "");
  if (Number.isNaN(created)) return false;

  // Absent on the very first callback for some providers; the account being
  // seconds old is enough on its own.
  const lastSignIn = Date.parse(user.last_sign_in_at ?? "");
  const reference = Number.isNaN(lastSignIn) ? Date.now() : lastSignIn;

  return reference - created < FIRST_SESSION_WINDOW_MS && reference >= created;
}

const PASSWORD_SIGNUP_KEY = "cinetier:analytics:password-signup";

/**
 * Armed by the password registration form right before it calls `signUp`,
 * since Supabase reports both a magic-link account and a password account
 * under the identical `app_metadata.provider === "email"` — nothing in the
 * callback session tells them apart on its own. Same "arm before, consume
 * once on the other side" shape as `armForkInteraction`/`takeForkInteraction`
 * in `lib/storage/fork-handoff.ts`, sessionStorage for the same reason: this
 * only has to survive the current tab, not a reload days later.
 *
 * Not armed for password SIGN-IN, only registration — signing in never
 * creates the account `isFirstSession` would need to see anyway, so there is
 * nothing here for a returning password user to mislabel.
 */
export function armPasswordSignup(): void {
  try {
    sessionStorage.setItem(PASSWORD_SIGNUP_KEY, "1");
  } catch {
    // Lost the marker: falls back to the same "magic_link" guess this made
    // before password accounts existed — wrong, but the conservative kind.
  }
}

function wasPasswordSignupArmed(): boolean {
  try {
    const value = sessionStorage.getItem(PASSWORD_SIGNUP_KEY);
    if (value !== null) sessionStorage.removeItem(PASSWORD_SIGNUP_KEY);
    return value === "1";
  } catch {
    return false;
  }
}

/**
 * Which door the account came through.
 *
 * Supabase reports the magic link and a password account under the same
 * `email` provider, so `armPasswordSignup`'s marker is what actually tells
 * them apart; everything else unrecognised is reported as a magic link,
 * since that is the oldest route this app offers and a wrong guess here is
 * less useful than a conservative one.
 */
export function signupMethod(user: SignupUserLike): SignupMethod {
  if (user.app_metadata?.provider === "google") return "google";
  return wasPasswordSignupArmed() ? "password" : "magic_link";
}

const RECORDED_KEY = "cinetier:analytics:signup";

/**
 * Whether this account's signup has already been counted on this device.
 *
 * The timestamp check alone would fire again on every reload during the first
 * minute of an account's life, which is exactly when a new user is most likely
 * to reload. Recorded per user id rather than as a flag, so a second account on
 * a shared machine still counts.
 */
export function alreadyCounted(userId: string, storage: Storage | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(RECORDED_KEY) === userId;
  } catch {
    return false;
  }
}

export function markCounted(userId: string, storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.setItem(RECORDED_KEY, userId);
  } catch {
    // A visitor who blocks storage is counted once per load rather than once
    // ever. Losing the guard is better than losing the event.
  }
}
