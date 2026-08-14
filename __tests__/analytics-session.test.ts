import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAnalyticsContext,
  getAttribution,
  getDeviceType,
  getSessionId,
  resetAnalyticsSession,
} from "@/lib/analytics/session";

function setUrl(search: string) {
  window.history.replaceState({}, "", `/landing${search}`);
}

function setReferrer(value: string) {
  Object.defineProperty(document, "referrer", { value, configurable: true });
}

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
}

beforeEach(() => {
  window.localStorage.clear();
  resetAnalyticsSession();
  setUrl("");
  setReferrer("");
  setWidth(1440);
});

describe("session id", () => {
  it("mints an id and reuses it on later calls", () => {
    const first = getSessionId();
    expect(first).toBeTruthy();
    expect(getSessionId()).toBe(first);
  });

  it("survives a reload, since it is read back from storage", () => {
    const first = getSessionId();
    // Nothing cleared: a fresh page load reads the same stored entry.
    expect(getSessionId()).toBe(first);
    expect(window.localStorage.getItem("cinetier:analytics:session")).toContain(first);
  });

  it("starts a new session once the visitor has been idle past the TTL", () => {
    const first = getSessionId();
    const stale = { id: first, lastSeenAt: Date.now() - 31 * 60 * 1000 };
    window.localStorage.setItem("cinetier:analytics:session", JSON.stringify(stale));

    expect(getSessionId()).not.toBe(first);
  });

  it("replaces a corrupt entry rather than throwing", () => {
    window.localStorage.setItem("cinetier:analytics:session", "{not json");
    expect(getSessionId()).toBeTruthy();
  });

  it("still returns an id when localStorage refuses to work", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("private mode");
      });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private mode");
    });

    expect(getSessionId()).toBeTruthy();

    setItem.mockRestore();
    getItem.mockRestore();
  });
});

describe("attribution", () => {
  it("captures campaign tags from the landing url", () => {
    setUrl("?utm_source=twitter&utm_medium=social&utm_campaign=launch");

    expect(getAttribution()).toMatchObject({
      utm_source: "twitter",
      utm_medium: "social",
      utm_campaign: "launch",
    });
  });

  it("captures the referrer when there are no tags", () => {
    setReferrer("https://example.com/post");
    expect(getAttribution().referrer).toBe("https://example.com/post");
  });

  it("keeps the first touch when a later page has no tags", () => {
    setUrl("?utm_source=twitter");
    getAttribution();

    // Navigating deeper into the app drops the query string; the original
    // source must not be overwritten with nothing.
    setUrl("/tier-list");
    expect(getAttribution().utm_source).toBe("twitter");
  });

  it("reports nulls for a direct visit", () => {
    expect(getAttribution()).toEqual({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      referrer: null,
    });
  });

  it("fills missing tags with null rather than leaving them undefined", () => {
    setUrl("?utm_source=newsletter");
    const attribution = getAttribution();

    expect(attribution.utm_source).toBe("newsletter");
    expect(attribution.utm_medium).toBeNull();
    expect(attribution.utm_campaign).toBeNull();
  });
});

describe("device type", () => {
  it("reads the viewport against the layout's own breakpoints", () => {
    setWidth(375);
    expect(getDeviceType()).toBe("mobile");
    setWidth(800);
    expect(getDeviceType()).toBe("tablet");
    setWidth(1440);
    expect(getDeviceType()).toBe("desktop");
  });
});

describe("getAnalyticsContext", () => {
  it("returns the full shape every event is enriched with", () => {
    setUrl("?utm_source=reddit&utm_medium=cpc&utm_campaign=spring");
    setReferrer("https://reddit.com/");
    setWidth(375);

    const context = getAnalyticsContext();

    expect(Object.keys(context).sort()).toEqual(
      [
        "device_type",
        "referrer",
        "session_id",
        "utm_campaign",
        "utm_medium",
        "utm_source",
      ].sort()
    );
    expect(context.device_type).toBe("mobile");
    expect(context.utm_source).toBe("reddit");
    expect(context.session_id).toBeTruthy();
  });
});
