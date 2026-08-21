import { beforeEach, describe, expect, it } from "vitest";
import { decideSync, type PullOutcome } from "@/lib/storage/sync-decision";
import {
  clearLocalOwner,
  ensureLocalOwner,
  readLocalOwner,
  stampLocalOwner,
  type LocalOwner,
} from "@/lib/storage/local-owner";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";

const empty: PullOutcome<string> = { status: "ok", items: [] };
const withCloud: PullOutcome<string> = { status: "ok", items: ["one", "two"] };
const failed: PullOutcome<string> = { status: "failed", reason: "401" };

const guest: LocalOwner = { kind: "guest" };
const unknown: LocalOwner = { kind: "unknown" };
const owned = (userId: string): LocalOwner => ({ kind: "user", userId });

describe("decideSync — the case that leaked a board into a stranger's account", () => {
  it("refuses to adopt a board that belongs to another account", () => {
    // A signed out, B signs in on the same browser, B's cloud is empty.
    const decision = decideSync(owned(A), empty, 59, B);
    expect(decision.action).toBe("discard-local");
    expect(decision.reason).toContain(A);
  });

  it("replaces the leftover board when the arriving account has its own", () => {
    expect(decideSync(owned(A), withCloud, 59, B).action).toBe("replace");
  });
});

describe("decideSync — a failed read is not an empty account", () => {
  it("aborts rather than adopting when the cloud could not be read", () => {
    // The old code returned [] for a 401, which looked exactly like a new
    // account and pushed the local board up.
    expect(decideSync(guest, failed, 59, B).action).toBe("abort");
  });

  it("aborts even for the account that owns the local data", () => {
    expect(decideSync(owned(B), failed, 59, B).action).toBe("abort");
  });

  it("says why, so a support question has an answer", () => {
    expect(decideSync(guest, failed, 3, B).reason).toContain("401");
  });
});

describe("decideSync — the legitimate cases still work", () => {
  it("adopts a genuine guest board into its first account", () => {
    const decision = decideSync(guest, empty, 12, B);
    expect(decision.action).toBe("adopt");
  });

  it("adopts the account's own unsynced board", () => {
    // Same person, cloud emptied or never written: this is their data.
    expect(decideSync(owned(B), empty, 12, B).action).toBe("adopt");
  });

  it("lets the cloud win when it has data", () => {
    expect(decideSync(guest, withCloud, 12, B).action).toBe("replace");
    expect(decideSync(owned(B), withCloud, 12, B).action).toBe("replace");
  });

  it("has nothing to decide when both sides are empty", () => {
    expect(decideSync(guest, empty, 0, B).action).toBe("replace");
  });
});

describe("decideSync — data that cannot be attributed", () => {
  it("never adopts an unmarked board", () => {
    // Everything ranked before the marker shipped, found with no owner.
    expect(decideSync(unknown, empty, 59, B).action).toBe("discard-local");
  });

  it("still lets the cloud replace it", () => {
    expect(decideSync(unknown, withCloud, 59, B).action).toBe("replace");
  });
});

describe("ensureLocalOwner", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stamps an empty browser as a guest, so its first board is attributable", () => {
    expect(ensureLocalOwner(false)).toEqual({ kind: "guest" });
    expect(readLocalOwner()).toEqual({ kind: "guest" });
  });

  it("leaves a board that was already here unattributed", () => {
    // An OAuth redirect lands as an ordinary page load carrying the new user,
    // so a session present at this moment proves nothing about whose data
    // this is. Claiming it would re-create the incident.
    expect(ensureLocalOwner(true)).toEqual({ kind: "unknown" });
    expect(readLocalOwner()).toBeNull();
  });

  it("keeps an existing marker rather than re-deciding", () => {
    stampLocalOwner(A);
    expect(ensureLocalOwner(true)).toEqual({ kind: "user", userId: A });
  });

  it("treats a corrupt marker as unattributable, not as a guest", () => {
    localStorage.setItem("cinetier:rankings:owner", "{not json");
    expect(readLocalOwner()).toEqual({ kind: "unknown" });
  });

  it("clears cleanly", () => {
    stampLocalOwner(A);
    clearLocalOwner();
    expect(readLocalOwner()).toBeNull();
  });
});
