import { describe, expect, it } from "vitest";
import { TIER_ORDER } from "@/lib/types";
import { TIER_META } from "@/lib/tier-meta";

describe("TIER_META", () => {
  it("has a name and non-empty description for every tier, including Unrated", () => {
    for (const tier of TIER_ORDER) {
      expect(TIER_META[tier]).toBeDefined();
      expect(TIER_META[tier].name.length).toBeGreaterThan(0);
      expect(TIER_META[tier].description.length).toBeGreaterThan(0);
    }
  });

  it("gives every tier a distinct name", () => {
    const names = TIER_ORDER.map((tier) => TIER_META[tier].name);
    expect(new Set(names).size).toBe(names.length);
  });
});
