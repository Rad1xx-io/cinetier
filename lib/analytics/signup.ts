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

/**
 * Which door the account came through.
 *
 * Supabase reports the magic link as `email`; everything unrecognised is
 * reported as a magic link too, since that is the only other route this app
 * offers and a wrong guess here is less useful than a conservative one.
 */
export function signupMethod(user: SignupUserLike): SignupMethod {
  return user.app_metadata?.provider === "google" ? "google" : "magic_link";
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
