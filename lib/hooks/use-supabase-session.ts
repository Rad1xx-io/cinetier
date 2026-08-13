"use client";

import { useSyncExternalStore } from "react";
import {
  getServerSessionSnapshot,
  getSessionSnapshot,
  subscribeToSession,
} from "@/lib/supabase/session-store";

/** Current auth state. `configured` is false when no Supabase env vars are set — cloud accounts are entirely optional. */
export function useSupabaseSession() {
  const snapshot = useSyncExternalStore(subscribeToSession, getSessionSnapshot, getServerSessionSnapshot);

  return {
    configured: snapshot.status !== "unconfigured",
    loading: snapshot.status === "loading",
    user: snapshot.status === "signed-in" ? snapshot.user : null,
  };
}
