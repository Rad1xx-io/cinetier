"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { registerPostHogProvider } from "@/lib/analytics/posthog-provider";
import { getSessionSnapshot, subscribeToSession } from "@/lib/supabase/session-store";

let started = false;

/**
 * Where the browser sends analytics, on this app's own origin.
 *
 * Not `NEXT_PUBLIC_POSTHOG_HOST` any more, and the reason is not tidiness:
 * Firefox's Enhanced Tracking Protection blocks requests to
 * `eu-assets.i.posthog.com` outright, at the network layer, with default
 * settings. Every event from every Firefox visitor was being dropped before it
 * left the browser — including `trackSyncDecision`, which is the only way a
 * real visitor hitting the sign-in freeze would ever be visible without
 * somebody reproducing it by hand. A same-origin path is not a trick to evade
 * a user's choice: it is what makes first-party product analytics reach the
 * first party, which is what a tracking-protection list is not aiming at.
 *
 * `vercel.json` rewrites this prefix to PostHog's EU ingest and asset hosts.
 * Deliberately shaped like one of this app's own API routes rather than
 * `/analytics`, `/telemetry` or `/posthog` — PostHog's own documentation notes
 * that blocklists match on path as well as domain, so an obvious name puts the
 * problem straight back. Vercel checks the filesystem before applying a
 * rewrite, so this cannot shadow a real route; the reverse is worth knowing,
 * though — an `app/api/px/` route added later would quietly take the prefix
 * back and silence analytics again.
 */
const ANALYTICS_PROXY_PATH = "/api/px";

/**
 * The PostHog app itself, for links the SDK generates (the toolbar, session
 * replay deep links). Without it those point at the proxy path, which serves
 * ingest and not a dashboard.
 *
 * Derived from the ingest host rather than hardcoded, so a project that moves
 * region — or a self-hosted one — stays correct: `eu.i.posthog.com` is served
 * by `eu.posthog.com`, `us.i.posthog.com` by `us.posthog.com`, and anything
 * else is its own app URL already.
 */
function dashboardOriginFor(ingestHost: string): string | undefined {
  try {
    const url = new URL(ingestHost);
    url.hostname = url.hostname.replace(/^([a-z0-9-]+)\.i\.posthog\.com$/, "$1.posthog.com");
    return url.origin;
  } catch {
    return undefined;
  }
}

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
  // The host is still required even though it is no longer the api_host: it is
  // what says a project is configured at all, and which region serves it.
  if (started || !key || !host) return started;

  posthog.init(key, {
    api_host: ANALYTICS_PROXY_PATH,
    ui_host: dashboardOriginFor(host),
    // PostHog's own $pageview, captured natively. The App Router changes routes
    // without a document load, so the default `history_change` mode is what
    // makes navigation visible at all — and session replay indexes against it.
    capture_pageview: "history_change",
    capture_pageleave: true,
    person_profiles: "identified_only",
    /*
     * Off, because this app is one hostname and the probe is noisy.
     *
     * With it on (the default), the SDK works out the widest domain it may
     * scope its cookie to by trying to set one: it walks the hostname's
     * suffixes from the shortest up, writing `dmn_chk_<random>=1;domain=.<suffix>`
     * with a three-second lifetime, and keeps the widest that sticks — deleting
     * it again immediately with `max-age=0`. Read from the installed
     * posthog-js, not inferred from the name.
     *
     * The first suffix it tries for tierlistonline.com is `.com`, which every
     * browser refuses as a public suffix — and Firefox reports that refusal in
     * the console as `Cookie "dmn_chk_…" has been rejected for invalid domain`.
     * So the message is the probe working, not a fault, and it has nothing to
     * do with the proxy: it depends only on the hostname.
     *
     * It is still worth turning off. Cross-subdomain identity buys this app
     * nothing — there are no subdomains sharing a session — and an unexplained
     * red line on every page load costs attention every time somebody opens the
     * console to look at something else. If a subdomain ever needs to share
     * identity, this is the line to remove.
     */
    cross_subdomain_cookie: false,
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
