import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SYNC_TRACE_KEY,
  describeCount,
  describeOwner,
  readSyncTrace,
  recordSyncTrace,
} from "@/lib/storage/sync-trace";
import { clearProviders, registerProvider, type AnalyticsEvent } from "@/lib/analytics/tracker";

const entry = {
  authEvent: "INITIAL_SESSION",
  userId: "user-b",
  ownerBefore: "guest" as const,
  localTitles: 59,
  localChannels: 9,
  cloudTitles: 0,
  cloudChannels: 0,
  titlesAction: "adopt",
  channelsAction: "adopt",
};

beforeEach(() => {
  sessionStorage.clear();
  clearProviders();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("a trace that outlives the page", () => {
  it("keeps the decision in sessionStorage, where a reload cannot take it", () => {
    recordSyncTrace(entry);

    // What a person would find afterwards: no console open, nothing armed in
    // advance, the sign-in already over.
    const stored = JSON.parse(sessionStorage.getItem(SYNC_TRACE_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ ownerBefore: "guest", titlesAction: "adopt" });
    expect(stored[0].at).toBeGreaterThan(0);
  });

  it("appends across the several page loads a sign-in really takes", () => {
    recordSyncTrace({ ...entry, authEvent: "INITIAL_SESSION", userId: "user-a" });
    recordSyncTrace({ ...entry, authEvent: "SIGNED_OUT", userId: null });
    recordSyncTrace({ ...entry, authEvent: "INITIAL_SESSION", userId: "user-b" });

    expect(readSyncTrace().map((e) => e.authEvent)).toEqual([
      "INITIAL_SESSION",
      "SIGNED_OUT",
      "INITIAL_SESSION",
    ]);
  });

  it("keeps the most recent decisions rather than growing without bound", () => {
    for (let i = 0; i < 40; i += 1) recordSyncTrace({ ...entry, localTitles: i });

    const trace = readSyncTrace();
    expect(trace).toHaveLength(25);
    expect(trace[trace.length - 1].localTitles).toBe(39);
  });

  it("survives a corrupted buffer instead of taking the sync down with it", () => {
    sessionStorage.setItem(SYNC_TRACE_KEY, "{not json");
    expect(() => recordSyncTrace(entry)).not.toThrow();
    expect(readSyncTrace()).toHaveLength(1);
  });
});

describe("the same decision, reported without anyone being asked", () => {
  it("reaches the analytics pipeline that PostHog is registered on", () => {
    const sent: AnalyticsEvent[] = [];
    registerProvider({ name: "test", send: (e) => void sent.push(e) });

    recordSyncTrace(entry);

    expect(sent).toHaveLength(1);
    expect(sent[0].event).toBe("sync_decision");
    expect(sent[0].properties).toMatchObject({
      auth_event: "INITIAL_SESSION",
      owner_before: "guest",
      local_titles: 59,
      cloud_titles: 0,
      titles_action: "adopt",
    });
  });

  it("names the other account as other, without carrying its id into the report", () => {
    const sent: AnalyticsEvent[] = [];
    registerProvider({ name: "test", send: (e) => void sent.push(e) });

    recordSyncTrace({
      ...entry,
      ownerBefore: describeOwner({ kind: "user", userId: "user-a" }, "user-b"),
    });

    expect(sent[0].properties.owner_before).toBe("other-user");
    expect(JSON.stringify(sent[0].properties)).not.toContain("user-a");
  });
});

describe("classifying what was found", () => {
  it("tells the four ownership states apart", () => {
    expect(describeOwner(null, "user-a")).toBe("none");
    expect(describeOwner({ kind: "guest" }, "user-a")).toBe("guest");
    expect(describeOwner({ kind: "unknown" }, "user-a")).toBe("unknown");
    expect(describeOwner({ kind: "user", userId: "user-a" }, "user-a")).toBe("same-user");
    expect(describeOwner({ kind: "user", userId: "user-a" }, "user-b")).toBe("other-user");
  });

  it("keeps a failed pull distinct from an empty cloud", () => {
    expect(describeCount({ status: "ok", items: [] })).toBe(0);
    expect(describeCount({ status: "failed", reason: "401" })).toBe("failed");
  });
});
