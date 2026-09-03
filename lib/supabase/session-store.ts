"use client";

import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SessionSnapshot =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: User };

const LOADING: SessionSnapshot = { status: "loading" };
const UNCONFIGURED: SessionSnapshot = { status: "unconfigured" };
const SIGNED_OUT: SessionSnapshot = { status: "signed-out" };

let cached: SessionSnapshot = LOADING;
let initialized = false;
const listeners = new Set<() => void>();

function setSnapshot(next: SessionSnapshot) {
  cached = next;
  listeners.forEach((listener) => listener());
}

/**
 * Lazily wires up the Supabase auth listener the first time anything asks
 * for the session. Backs useSyncExternalStore in useSupabaseSession — same
 * pattern as ranked-titles-store, for the same reason (no setState-in-effect,
 * a stable SSR snapshot).
 */
function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    setSnapshot(UNCONFIGURED);
    return;
  }

  supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
    setSnapshot(data.user ? { status: "signed-in", user: data.user } : SIGNED_OUT);
  });

  supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
    setSnapshot(session?.user ? { status: "signed-in", user: session.user } : SIGNED_OUT);
  });
}

export function subscribeToSession(callback: () => void): () => void {
  ensureInitialized();
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getSessionSnapshot(): SessionSnapshot {
  ensureInitialized();
  return cached;
}

export function getServerSessionSnapshot(): SessionSnapshot {
  return LOADING;
}

/**
 * Forces every subscriber to re-check the session, for the one case
 * `onAuthStateChange` does not cover on its own: a session established by a
 * server round trip (`/api/auth/sign-in`) rather than by this browser
 * client's own `signInWithPassword`/`signInWithOtp`/`signInWithOAuth` call.
 * Those write cookies as a side effect of an action *this* client
 * performed, which is what fires the listener already wired up in
 * `ensureInitialized`. A server route writes the same cookies, but nothing
 * here was the one that asked for it, so nothing here would otherwise
 * notice — the header/Settings would keep showing "Sign in" until an
 * unrelated navigation happened to remount the page.
 *
 * `getSession()` alone is not enough to close that gap: `@supabase/auth-js`
 * reads its storage (cookies, for this app's `createBrowserClient`) fresh
 * on every call, so it does return the session the server just wrote — but
 * it does not itself notify `onAuthStateChange` listeners when the session
 * it read was already valid, only when a refresh or explicit sign-in
 * action changes it. This function is what actually pushes the result into
 * the same `cached`/`listeners` this store's own callback updates, so a
 * caller that runs a sign-in through a server route can pick it up exactly
 * the way one run through this browser client already does.
 */
export async function refreshSessionFromCookies(): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  setSnapshot(data.session?.user ? { status: "signed-in", user: data.session.user } : SIGNED_OUT);
}
