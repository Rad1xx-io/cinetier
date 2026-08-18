"use client";

import { useEffect } from "react";
import { trackSignupCompleted } from "@/lib/analytics/events";
import { alreadyCounted, isFirstSession, markCounted, signupMethod } from "@/lib/analytics/signup";
import { getSessionSnapshot, subscribeToSession } from "@/lib/supabase/session-store";

/**
 * Counts a new account once, when it first appears.
 *
 * Mounted in the root layout beside the other trackers rather than hung off the
 * sign-in form: Supabase finishes both the magic link and the Google round trip
 * by redirecting back into the app, so the form that started it is long gone by
 * the time there is a user to report.
 */
export function SignupTracker() {
  useEffect(() => {
    function check() {
      const snapshot = getSessionSnapshot();
      if (snapshot.status !== "signed-in") return;

      const { user } = snapshot;
      const storage = typeof window === "undefined" ? null : window.localStorage;
      if (!isFirstSession(user) || alreadyCounted(user.id, storage)) return;

      // Recorded before the send: a duplicate event is worse than a lost one
      // here, since acquisition numbers are what this feeds.
      markCounted(user.id, storage);
      trackSignupCompleted(signupMethod(user), window.location.pathname);
    }

    check();
    return subscribeToSession(check);
  }, []);

  return null;
}
