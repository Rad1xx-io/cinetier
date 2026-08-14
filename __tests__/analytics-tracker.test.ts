import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsEvent, AnalyticsProvider } from "@/lib/analytics/tracker";

let signedIn = false;

vi.mock("@/lib/supabase/session-store", () => ({
  getSessionSnapshot: () =>
    signedIn
      ? { status: "signed-in", user: { id: "user-42" } }
      : { status: "signed-out" },
}));

const { buildEvent, clearProviders, getProviders, registerProvider, trackEvent } = await import(
  "@/lib/analytics/tracker"
);
const { resetAnalyticsSession } = await import("@/lib/analytics/session");
const events = await import("@/lib/analytics/events");

function collector(): { provider: AnalyticsProvider; sent: AnalyticsEvent[] } {
  const sent: AnalyticsEvent[] = [];
  return {
    sent,
    provider: {
      name: `collector-${Math.random()}`,
      send: (event) => {
        sent.push(event);
      },
    },
  };
}

beforeEach(() => {
  signedIn = false;
  window.localStorage.clear();
  resetAnalyticsSession();
  clearProviders();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("payload shape", () => {
  it("carries the event, a timestamp, the context and the properties", () => {
    const event = buildEvent("thing_happened", { a: 1 });

    expect(event.event).toBe("thing_happened");
    expect(typeof event.timestamp).toBe("number");
    expect(event.properties).toEqual({ a: 1 });
    expect(event.context.session_id).toBeTruthy();
    expect(event.context.device_type).toBeTruthy();
  });

  it("defaults properties to an empty object rather than undefined", () => {
    expect(buildEvent("bare").properties).toEqual({});
  });

  it("reports a null user for a guest", () => {
    expect(buildEvent("anon").user_id).toBeNull();
  });

  it("attaches the user id once signed in", () => {
    signedIn = true;
    expect(buildEvent("known").user_id).toBe("user-42");
  });

  it("reuses one session id across separate events", () => {
    const first = buildEvent("one");
    const second = buildEvent("two");
    expect(first.context.session_id).toBe(second.context.session_id);
  });
});

describe("providers", () => {
  it("delivers an event to every registered provider", () => {
    const a = collector();
    const b = collector();
    registerProvider(a.provider);
    registerProvider(b.provider);

    trackEvent("shared", { x: true });

    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(1);
    expect(a.sent[0].properties).toEqual({ x: true });
  });

  it("registers a given provider only once", () => {
    const { provider } = collector();
    registerProvider(provider);
    registerProvider(provider);
    expect(getProviders()).toHaveLength(1);
  });

  it("keeps going when one provider throws", () => {
    const healthy = collector();
    registerProvider({
      name: "broken",
      send() {
        throw new Error("collector is down");
      },
    });
    registerProvider(healthy.provider);

    expect(() => trackEvent("resilient")).not.toThrow();
    expect(healthy.sent).toHaveLength(1);
  });

  it("does not throw when nothing is registered", () => {
    expect(() => trackEvent("into_the_void")).not.toThrow();
  });
});

describe("typed funnel helpers", () => {
  it("names events and properties in snake_case", () => {
    const { provider, sent } = collector();
    registerProvider(provider);

    events.trackItemRanked("movie-27205", "S", "A");

    expect(sent[0].event).toBe("item_ranked");
    expect(sent[0].properties).toEqual({
      item_id: "movie-27205",
      tier: "S",
      previous_tier: "A",
    });
  });

  it("omits an optional property instead of sending it empty", () => {
    const { provider, sent } = collector();
    registerProvider(provider);

    events.trackItemRanked("movie-1", "B");

    // A first placement has no previous tier; the key must be absent so it can
    // be told apart from a re-rank.
    expect("previous_tier" in sent[0].properties).toBe(false);
  });

  it("passes booleans through rather than stringifying them", () => {
    const { provider, sent } = collector();
    registerProvider(provider);

    events.trackListSaved("list-1", 12, false);

    expect(sent[0].properties).toEqual({
      list_id: "list-1",
      items_count: 12,
      is_draft: false,
    });
  });

  it("covers the sharing funnel", () => {
    const { provider, sent } = collector();
    registerProvider(provider);

    events.trackShareClicked("tier_list", "list-9");
    events.trackLinkCopied("tier_list", "list-9");
    events.trackSharedContentViewed("tier_list", "list-9", "author-3");

    expect(sent.map((e) => e.event)).toEqual([
      "share_clicked",
      "link_copied",
      "shared_content_viewed",
    ]);
    expect(sent[2].properties.creator_user_id).toBe("author-3");
  });
});
