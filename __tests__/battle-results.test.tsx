import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BattleResults } from "@/components/battle/battle-results";
import { calculateMatchScore } from "@/lib/battle/calculator";
import type { BattleComparison, BattleItem } from "@/lib/types/battle";

const items: BattleItem[] = [
  { id: "m-1", title: "Первый", category: "cinema" },
  { id: "m-2", title: "Второй", category: "cinema" },
  { id: "m-3", title: "Третий", category: "cinema" },
];

const creatorRatings = { "m-1": "S", "m-2": "A", "m-3": "S" };
const participantRatings = { "m-1": "S", "m-2": "B", "m-3": "F" };

function renderResults(overrides: Partial<BattleComparison> = {}) {
  const comparison = { ...calculateMatchScore(creatorRatings, participantRatings), ...overrides };
  return render(
    <BattleResults
      battleId="battle-1"
      comparison={comparison}
      items={items}
      creatorRatings={creatorRatings}
      participantRatings={participantRatings}
    />
  );
}

/** The <section> owning a comparison list, located by its heading. */
function section(heading: string): HTMLElement {
  return screen.getByRole("heading", { name: heading }).closest("section") as HTMLElement;
}

const writeText = vi.fn().mockResolvedValue(undefined);
const share = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  Object.defineProperty(window, "location", {
    value: { origin: "https://tierlistonline.app" },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // Not every browser has it, and the component branches on that.
  Reflect.deleteProperty(navigator, "share");
});

describe("BattleResults — the score", () => {
  it("shows the match percentage and a verdict", () => {
    renderResults();

    // m-1 exact, m-2 one tier apart, m-3 five apart -> 1 - 6/15 = 60%.
    expect(screen.getByText("60%")).toBeDefined();
    expect(screen.getByText("Plenty in common")).toBeDefined();
  });

  it("says how much of the pool was actually compared", () => {
    renderResults();

    expect(screen.getByText("Compared 3 of 3 entries.")).toBeDefined();
  });

  it("fills the ring in proportion to the score", () => {
    const { container } = renderResults();
    const ring = container.querySelector(".animate-ring-fill") as SVGCircleElement;

    const circumference = Number(ring.getAttribute("stroke-dasharray"));
    const offset = Number(ring.style.getPropertyValue("--ring-offset"));

    // 60% scored leaves 40% of the circle unfilled.
    expect(offset / circumference).toBeCloseTo(0.4, 5);
  });

  it("refuses to show 0% when there was nothing to compare", () => {
    renderResults({
      overallMatchPercentage: 0,
      sharedItemCount: 0,
      topAgreements: [],
      topDisagreements: [],
    });

    expect(screen.getByText("Nothing to compare")).toBeDefined();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("still shows 0% when the two genuinely disagreed on everything", () => {
    renderResults({ overallMatchPercentage: 0, sharedItemCount: 3 });

    expect(screen.getByText("0%")).toBeDefined();
    expect(screen.getByText("Opposite taste")).toBeDefined();
    expect(screen.queryByText("Nothing to compare")).toBeNull();
  });
});

describe("BattleResults — comparison lists", () => {
  it("lists agreements and disagreements with both sides' tiers", () => {
    renderResults();

    expect(screen.getByText("Total agreement")).toBeDefined();
    expect(screen.getByText("Biggest disagreements")).toBeDefined();

    // m-1 agreed (S/S), m-3 the biggest gap (S/F). The title also appears in the
    // poster placeholder, so each assertion is scoped to its own section.
    const agreements = section("Total agreement");
    const disagreements = section("Biggest disagreements");
    expect(within(agreements).getAllByText("Первый").length).toBeGreaterThan(0);
    expect(within(disagreements).getAllByText("Третий").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Author").length).toBeGreaterThan(0);
    expect(screen.getAllByText("You").length).toBeGreaterThan(0);
  });

  it("hides a section that has nothing in it", () => {
    renderResults({ topDisagreements: [] });

    expect(screen.queryByText("Biggest disagreements")).toBeNull();
    expect(screen.getByText("Total agreement")).toBeDefined();
  });

  it("falls back to the id when a rating outlived its item", () => {
    render(
      <BattleResults
        battleId="battle-1"
        comparison={{
          overallMatchPercentage: 40,
          topAgreements: [],
          topDisagreements: ["ghost-item"],
          sharedItemCount: 1,
        }}
        items={items}
        creatorRatings={{ "ghost-item": "S" }}
        participantRatings={{ "ghost-item": "F" }}
      />
    );

    expect(screen.getAllByText("ghost-item").length).toBeGreaterThan(0);
  });

  it("marks a tier the participant never gave", () => {
    render(
      <BattleResults
        battleId="battle-1"
        comparison={{
          overallMatchPercentage: 100,
          topAgreements: ["m-1"],
          topDisagreements: [],
          sharedItemCount: 1,
        }}
        items={items}
        creatorRatings={{ "m-1": "S" }}
        participantRatings={{}}
      />
    );

    expect(screen.getByText("—")).toBeDefined();
  });
});

describe("BattleResults — sharing", () => {
  it("copies the battle link when the browser has no share sheet", async () => {
    renderResults();

    fireEvent.click(screen.getByRole("button", { name: /Share the result/ }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://tierlistonline.app/battle/battle-1");
    });
    expect(await screen.findByText("Link copied")).toBeDefined();
  });

  it("prefers the native share sheet where it exists", async () => {
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    renderResults();

    fireEvent.click(screen.getByRole("button", { name: /Share the result/ }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to copying when the share sheet is dismissed", async () => {
    Object.defineProperty(navigator, "share", {
      value: vi.fn().mockRejectedValue(new Error("AbortError")),
      configurable: true,
    });
    renderResults();

    fireEvent.click(screen.getByRole("button", { name: /Share the result/ }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://tierlistonline.app/battle/battle-1");
    });
  });

  it("offers a way to start a battle of your own", () => {
    renderResults();

    const cta = screen.getByRole("link", { name: /Create my own battle/ });
    expect(cta.getAttribute("href")).toBe("/tier-list");
  });
});
