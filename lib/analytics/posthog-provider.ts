import { registerProvider, type AnalyticsEvent } from "@/lib/analytics/tracker";

/** Only what this module uses — so tests can hand it a two-method stub. */
export interface PostHogLike {
  capture(event: string, properties?: Record<string, unknown>): void;
}

/**
 * PostHog captures `$pageview` itself on every history change, so forwarding
 * our own page_view would file the same navigation twice under two names.
 */
const SKIPPED_EVENTS = new Set(["page_view"]);

/**
 * Sends every event the app already tracks to PostHog.
 *
 * Deliberately a provider rather than a second tracking API: `lib/analytics`
 * owns the event names, the properties and the session context, and a parallel
 * `posthog.capture` sprinkled through the components would mean two definitions
 * of "a fork happened" that drift apart the first time one is edited.
 */
export function registerPostHogProvider(client: PostHogLike): void {
  registerProvider({
    name: "posthog",
    send(event: AnalyticsEvent) {
      if (SKIPPED_EVENTS.has(event.event)) return;

      // Context is already flat and snake_cased, which is what PostHog wants for
      // breakdowns — nulls included, so an unattributed visit is visibly
      // unattributed rather than missing the property altogether.
      client.capture(event.event, { ...event.properties, ...event.context });
    },
  });
}
