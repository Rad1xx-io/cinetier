import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerPostHogProvider, type PostHogLike } from "@/lib/analytics/posthog-provider";
import {
  clearProviders,
  getProviders,
  registerProvider,
  trackEvent,
} from "@/lib/analytics/tracker";

function stubClient() {
  const captured: { event: string; properties?: Record<string, unknown> }[] = [];
  const client: PostHogLike = {
    capture(event, properties) {
      captured.push({ event, properties });
    },
  };
  return { client, captured };
}

beforeEach(() => {
  clearProviders();
  window.localStorage.clear();
});

afterEach(() => {
  clearProviders();
  vi.restoreAllMocks();
});

describe("registerPostHogProvider", () => {
  it("forwards a tracked event under its own name", () => {
    const { client, captured } = stubClient();
    registerPostHogProvider(client);

    trackEvent("fork_created", { original_list_id: "a", new_list_id: "b" });

    expect(captured).toHaveLength(1);
    expect(captured[0].event).toBe("fork_created");
    expect(captured[0].properties).toMatchObject({
      original_list_id: "a",
      new_list_id: "b",
    });
  });

  it("flattens the session context alongside the properties", () => {
    const { client, captured } = stubClient();
    registerPostHogProvider(client);

    trackEvent("post_liked", { post_id: "p1", liked: true });

    const props = captured[0].properties!;
    expect(typeof props.session_id).toBe("string");
    expect(props.device_type).toBeDefined();
    // Present even when unset, so "no campaign" is a value rather than a gap.
    expect(props).toHaveProperty("utm_source");
  });

  it("leaves page_view to PostHog's own $pageview", () => {
    const { client, captured } = stubClient();
    registerPostHogProvider(client);

    trackEvent("page_view", { page_path: "/feed" });
    trackEvent("post_commented", { post_id: "p1" });

    expect(captured.map((c) => c.event)).toEqual(["post_commented"]);
  });

  it("registers once, so a double init cannot double-report", () => {
    const { client } = stubClient();
    registerPostHogProvider(client);
    registerPostHogProvider(client);

    expect(getProviders().filter((p) => p.name === "posthog")).toHaveLength(1);
  });

  it("keeps other providers alive when capture throws", () => {
    const other = vi.fn();
    registerPostHogProvider({
      capture() {
        throw new Error("network down");
      },
    });
    registerProvider({ name: "other", send: other });

    expect(() => trackEvent("battle_created", { battle_id: "b1" })).not.toThrow();
    expect(other).toHaveBeenCalledOnce();
  });
});
