"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { registerPostHogProvider } from "@/lib/analytics/posthog-provider";
import { getSessionSnapshot, subscribeToSession } from "@/lib/supabase/session-store";

let started = false;

/**
 * Brings up PostHog once per page load, on the client only.
 *
 * The module-level flag rather than a ref: React Strict Mode mounts this twice
 * in development, and a second `posthog.init` would start a second recorder
 * against the same session.
 */
function start(): boolean {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  // Missing keys are a valid state, not a failure: local runs and forks without
  // a PostHog project should behave exactly as they did before this existed.
  if (started || !key || !host) return started;

  posthog.init(key, {
    api_host: host,
    // PostHog's own $pageview, captured natively. The App Router changes routes
    // without a document load, so the default `history_change` mode is what
    // makes navigation visible at all — and session replay indexes against it.
    capture_pageview: "history_change",
    capture_pageleave: true,
    person_profiles: "identified_only",
    session_recording: {
      /*
       * Replay records the live DOM, and this app asks for an email address to
       * send a magic link. Masking every input is the only setting where a
       * recording cannot quietly become a log of what people typed; the tier
       * board, which is the thing worth watching, contains no input at all.
       */
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
    },
    // Development noise stays out of the project's numbers.
    opt_out_capturing_by_default: process.env.NODE_ENV === "development",
  });

  registerPostHogProvider(posthog);
  started = true;
  return true;
}

/**
 * Ties PostHog's identity to the Supabase user.
 *
 * Without this every signed-in session is a fresh anonymous visitor, and the
 * funnels the events were written for cannot join a fork to the person who
 * later published a post.
 */
function syncIdentity(): void {
  const snapshot = getSessionSnapshot();
  if (snapshot.status === "signed-in") {
    posthog.identify(snapshot.user.id, {
      // Email deliberately withheld: the funnels key on the user id, and a
      // product-analytics store is not where a mailing list belongs.
      supabase_user: true,
    });
  } else if (snapshot.status === "signed-out") {
    // Otherwise the next person on a shared machine inherits the last one's id.
    posthog.reset();
  }
}

export function PostHogProvider() {
  useEffect(() => {
    if (!start()) return;

    syncIdentity();
    return subscribeToSession(syncIdentity);
  }, []);

  return null;
}
