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
