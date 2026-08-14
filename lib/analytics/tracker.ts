import { getAnalyticsContext, type AnalyticsContext } from "@/lib/analytics/session";
import { getSessionSnapshot } from "@/lib/supabase/session-store";

export type AnalyticsProperties = Record<string, unknown>;

export interface AnalyticsEvent {
  event: string;
  /** Epoch ms, stamped at the call site rather than on arrival. */
  timestamp: number;
  /** Null for a guest — most of the funnel happens before anyone signs in. */
  user_id: string | null;
  context: AnalyticsContext;
  properties: AnalyticsProperties;
}

/**
 * Somewhere an event can be sent. Implementations are registered at startup, so
 * swapping PostHog for an in-house endpoint is a change in one place and none
 * of the call sites.
 */
export interface AnalyticsProvider {
  name: string;
  send(event: AnalyticsEvent): void | Promise<void>;
}

const providers: AnalyticsProvider[] = [];

export function registerProvider(provider: AnalyticsProvider): void {
  if (providers.some((p) => p.name === provider.name)) return;
  providers.push(provider);
}

/** Drops every registered provider. For tests and for opting out at runtime. */
export function clearProviders(): void {
  providers.length = 0;
}

export function getProviders(): readonly AnalyticsProvider[] {
  return providers;
}

/** Logs to the console instead of sending anywhere. Registered by default in development. */
export const consoleProvider: AnalyticsProvider = {
  name: "console",
  send(event) {
    // Grouped rather than one long line, so a funnel is readable while stepping
    // through it in the browser.
    console.groupCollapsed(`analytics · ${event.event}`);
    console.log("properties", event.properties);
    console.log("context", event.context);
    console.log("user_id", event.user_id);
    console.groupEnd();
  },
};

/**
 * Posts to an HTTP collector. Only useful once an endpoint exists, so it is
 * built here but never registered automatically.
 */
export function createEndpointProvider(url: string): AnalyticsProvider {
  return {
    name: `endpoint:${url}`,
    send(event) {
      // sendBeacon survives the page being closed mid-navigation, which is
      // exactly when the last event of a funnel tends to fire.
      const body = JSON.stringify(event);
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        // Analytics must never surface as a user-facing failure.
      });
    },
  };
}

let initialised = false;

/**
 * Registers the default providers once.
 *
 * Called lazily from trackEvent rather than at import time: the module is
 * pulled into server bundles too, and nothing here should run until a real
 * event fires in a browser.
 */
function ensureInitialised(): void {
  if (initialised) return;
  initialised = true;

  if (process.env.NODE_ENV === "development") {
    registerProvider(consoleProvider);
  }

  const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  if (endpoint) registerProvider(createEndpointProvider(endpoint));
}

function currentUserId(): string | null {
  try {
    const snapshot = getSessionSnapshot();
    return snapshot.status === "signed-in" ? snapshot.user.id : null;
  } catch {
    // The session store touches Supabase config; a misconfigured deployment
    // should lose the user id, not the event.
    return null;
  }
}

/** Assembles the enriched event without sending it. Exported for tests and previews. */
export function buildEvent(
  eventName: string,
  properties: AnalyticsProperties = {}
): AnalyticsEvent {
  return {
    event: eventName,
    timestamp: Date.now(),
    user_id: currentUserId(),
    context: getAnalyticsContext(),
    properties,
  };
}

/**
 * The single entry point every tracking call goes through.
 *
 * Never throws and never returns a promise the caller has to handle: a UI
 * action must not be able to fail because a measurement did.
 */
export function trackEvent(eventName: string, properties?: AnalyticsProperties): void {
  // Server-side render, or a test importing the module without a DOM.
  if (typeof window === "undefined") return;

  ensureInitialised();

  let event: AnalyticsEvent;
  try {
    event = buildEvent(eventName, properties);
  } catch {
    return;
  }

  for (const provider of providers) {
    try {
      void provider.send(event);
    } catch {
      // One broken provider must not stop the others.
    }
  }
}
