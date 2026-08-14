import { describe, expect, it } from "vitest";
import { calculateMatchScore, MAX_TIER_GAP, TIER_VALUES, TOP_COUNT } from "@/lib/battle/calculator";

describe("calculateMatchScore", () => {
  describe("the two ends of the scale", () => {
    it("scores identical rankings at 100%", () => {
      const ratings = { a: "S", b: "B", c: "F" };
      const result = calculateMatchScore(ratings, { ...ratings });

      expect(result.overallMatchPercentage).toBe(100);
      expect(result.sharedItemCount).toBe(3);
      expect(result.topAgreements).toEqual(["a", "b", "c"]);
      expect(result.topDisagreements).toEqual([]);
    });

    it("scores a perfectly inverted ranking at 0%", () => {
      const result = calculateMatchScore(
        { a: "S", b: "S", c: "F" },
        { a: "F", b: "F", c: "S" }
      );

      expect(result.overallMatchPercentage).toBe(0);
      expect(result.sharedItemCount).toBe(3);
      // Nothing here is within a tier of agreeing.
      expect(result.topAgreements).toEqual([]);
      expect(result.topDisagreements).toEqual(["a", "b", "c"]);
    });

    it("scores the exact midpoint at 50%", () => {
      // A single gap of 2.5 is not expressible, so two items of 2 and 3 average it.
      const result = calculateMatchScore({ a: "S", b: "S" }, { a: "B", b: "C" });

      expect(result.overallMatchPercentage).toBe(50);
    });
  });

  describe("items only one side rated", () => {
    it("ignores items the participant skipped", () => {
      const result = calculateMatchScore(
        { a: "S", b: "A", skipped: "F" },
        { a: "S", b: "A" }
      );

      // Two shared items, both exact: a skipped title must not drag the score down.
      expect(result.overallMatchPercentage).toBe(100);
      expect(result.sharedItemCount).toBe(2);
      expect(result.topAgreements).toEqual(["a", "b"]);
    });

    it("ignores items the creator never put in the pool", () => {
      const result = calculateMatchScore({ a: "S" }, { a: "S", stowaway: "F" });

      expect(result.overallMatchPercentage).toBe(100);
      expect(result.sharedItemCount).toBe(1);
      expect(result.topAgreements).toEqual(["a"]);
    });

    it("reports no overlap as 0% with sharedItemCount 0", () => {
      const result = calculateMatchScore({ a: "S", b: "A" }, { x: "S", y: "A" });

      expect(result.sharedItemCount).toBe(0);
      expect(result.overallMatchPercentage).toBe(0);
      expect(result.topAgreements).toEqual([]);
      expect(result.topDisagreements).toEqual([]);
    });

    it("handles both sides being empty", () => {
      expect(calculateMatchScore({}, {})).toEqual({
        overallMatchPercentage: 0,
        topAgreements: [],
        topDisagreements: [],
        sharedItemCount: 0,
      });
    });

    it("distinguishes no overlap from total disagreement only via sharedItemCount", () => {
      const noOverlap = calculateMatchScore({ a: "S" }, { b: "F" });
      const opposite = calculateMatchScore({ a: "S" }, { a: "F" });

      expect(noOverlap.overallMatchPercentage).toBe(opposite.overallMatchPercentage);
      expect(noOverlap.sharedItemCount).toBe(0);
      expect(opposite.sharedItemCount).toBe(1);
    });
  });

  describe("values that are not tiers", () => {
    it("drops an unknown tier rather than scoring it", () => {
      const result = calculateMatchScore({ a: "S", b: "Unrated" }, { a: "S", b: "S" });

      expect(result.sharedItemCount).toBe(1);
      expect(result.overallMatchPercentage).toBe(100);
    });

    it("drops empty and malformed values from either side", () => {
      const result = calculateMatchScore(
        { a: "A", blank: "", lower: "s" },
        { a: "A", blank: "A", lower: "s" }
      );

      expect(result.sharedItemCount).toBe(1);
      expect(result.topAgreements).toEqual(["a"]);
    });

    it("is not fooled by inherited object properties", () => {
      // `participantRatings["constructor"]` resolves to a function, not a tier.
      const result = calculateMatchScore({ constructor: "S", toString: "A" }, {});

      expect(result.sharedItemCount).toBe(0);
    });
  });

  describe("highlight lists", () => {
    it("orders agreements by closeness and disagreements by distance", () => {
      const result = calculateMatchScore(
        { exact: "S", near: "A", far: "S", furthest: "S" },
        { exact: "S", near: "B", far: "C", furthest: "F" }
      );

      expect(result.topAgreements).toEqual(["exact", "near"]);
      expect(result.topDisagreements).toEqual(["furthest", "far"]);
    });

    it("excludes a two-tier gap from agreements and a one-tier gap from disagreements", () => {
      const result = calculateMatchScore({ gap1: "S", gap2: "S" }, { gap1: "A", gap2: "B" });

      expect(result.topAgreements).toEqual(["gap1"]);
      expect(result.topDisagreements).toEqual(["gap2"]);
    });

    it(`caps each list at ${TOP_COUNT} items`, () => {
      const creator = { a: "S", b: "S", c: "S", d: "S", e: "S" };
      const exact = { a: "S", b: "S", c: "S", d: "S", e: "S" };
      const opposite = { a: "F", b: "F", c: "F", d: "F", e: "F" };

      expect(calculateMatchScore(creator, exact).topAgreements).toHaveLength(TOP_COUNT);
      expect(calculateMatchScore(creator, opposite).topDisagreements).toHaveLength(TOP_COUNT);
    });

    it("breaks ties on item id so repeated calls agree", () => {
      const creator = { zebra: "S", apple: "S", mango: "S" };
      const participant = { zebra: "F", apple: "F", mango: "F" };

      const first = calculateMatchScore(creator, participant);
      const second = calculateMatchScore(creator, participant);

      expect(first.topDisagreements).toEqual(["apple", "mango", "zebra"]);
      expect(first.topDisagreements).toEqual(second.topDisagreements);
    });
  });

  describe("scale properties", () => {
    it("is symmetric — swapping the two sides gives the same percentage", () => {
      const creator = { a: "S", b: "C", c: "F", d: "B" };
      const participant = { a: "B", b: "C", c: "A", d: "D" };

      expect(calculateMatchScore(creator, participant).overallMatchPercentage).toBe(
        calculateMatchScore(participant, creator).overallMatchPercentage
      );
    });

    it("normalises by item count, so battle size does not shift the score", () => {
      const small = calculateMatchScore({ a: "S" }, { a: "A" });
      const large = calculateMatchScore(
        { a: "S", b: "A", c: "B", d: "C" },
        { a: "A", b: "B", c: "C", d: "D" }
      );

      // Every item is one tier apart in both, so both must land on the same number.
      expect(small.overallMatchPercentage).toBe(large.overallMatchPercentage);
      expect(small.overallMatchPercentage).toBe(80);
    });

    it("never leaves the 0-100 range across every possible tier pairing", () => {
      const tiers = Object.keys(TIER_VALUES);
      for (const creatorTier of tiers) {
        for (const participantTier of tiers) {
          const { overallMatchPercentage } = calculateMatchScore(
            { a: creatorTier },
            { a: participantTier }
          );
          expect(overallMatchPercentage).toBeGreaterThanOrEqual(0);
          expect(overallMatchPercentage).toBeLessThanOrEqual(100);
        }
      }
    });

    it("keeps MAX_TIER_GAP consistent with the tier table", () => {
      const values = Object.values(TIER_VALUES);
      expect(MAX_TIER_GAP).toBe(Math.max(...values) - Math.min(...values));
    });
  });
});
