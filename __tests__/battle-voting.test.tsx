import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BattleVoting } from "@/components/battle/battle-voting";
import type { BattleItem } from "@/lib/types/battle";

const items: BattleItem[] = [
  { id: "m-1", title: "Первый", category: "cinema" },
  { id: "m-2", title: "Второй", category: "cinema" },
  { id: "m-3", title: "Третий", category: "cinema" },
];

/** Tier buttons carry their full label, so match on the id prefix. */
function rate(tier: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tier} —`) }));
}

function skip() {
  fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
}

afterEach(cleanup);

describe("BattleVoting — navigation", () => {
  it("opens on the first item with the progress it implies", () => {
    render(<BattleVoting items={items} onComplete={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Первый" })).toBeDefined();
    expect(screen.getByText("Entry 1 of 3")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
  });

  it("advances to the next item as soon as a tier is picked", () => {
    render(<BattleVoting items={items} onComplete={vi.fn()} />);

    rate("S");

    expect(screen.getByRole("heading", { name: "Второй" })).toBeDefined();
    expect(screen.getByText("Entry 2 of 3")).toBeDefined();
  });

  it("advances on a skip without recording anything", () => {
    const onComplete = vi.fn();
    render(<BattleVoting items={items} onComplete={onComplete} />);

    skip();

    expect(screen.getByRole("heading", { name: "Второй" })).toBeDefined();
    expect(screen.getByText("Rated: 0")).toBeDefined();
  });

  it("steps back to a previous item and shows the choice made there", () => {
    render(<BattleVoting items={items} onComplete={vi.fn()} />);

    rate("A");
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));

    expect(screen.getByRole("heading", { name: "Первый" })).toBeDefined();
    expect(screen.getByText("You picked A")).toBeDefined();
    expect(screen.getByRole("button", { name: /^A —/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("cannot step back from the first item", () => {
    render(<BattleVoting items={items} onComplete={vi.fn()} />);

    expect((screen.getByRole("button", { name: /Back/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders nothing when the pool is empty", () => {
    const { container } = render(<BattleVoting items={[]} onComplete={vi.fn()} />);

    expect(container.firstChild).toBeNull();
  });
});

describe("BattleVoting — accumulating votes", () => {
  it("collects every choice and reports them once on the last item", () => {
    const onComplete = vi.fn();
    render(<BattleVoting items={items} onComplete={onComplete} />);

    rate("S");
    rate("B");
    expect(onComplete).not.toHaveBeenCalled();

    rate("F");

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({ "m-1": "S", "m-2": "B", "m-3": "F" });
  });

  it("counts how many items have been answered", () => {
    render(<BattleVoting items={items} onComplete={vi.fn()} />);

    expect(screen.getByText("Rated: 0")).toBeDefined();
    rate("S");
    expect(screen.getByText("Rated: 1")).toBeDefined();
  });

  it("replaces an earlier choice instead of adding a second one", () => {
    const onComplete = vi.fn();
    render(<BattleVoting items={items} onComplete={onComplete} />);

    rate("S");
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    rate("D");
    rate("B");
    rate("C");

    expect(onComplete).toHaveBeenCalledWith({ "m-1": "D", "m-2": "B", "m-3": "C" });
  });

  it("omits skipped items from the result rather than sending a blank", () => {
    const onComplete = vi.fn();
    render(<BattleVoting items={items} onComplete={onComplete} />);

    rate("S");
    skip();
    rate("A");

    expect(onComplete).toHaveBeenCalledWith({ "m-1": "S", "m-3": "A" });
  });

  it("drops a rating that is skipped on a second pass", () => {
    const onComplete = vi.fn();
    render(<BattleVoting items={items} onComplete={onComplete} />);

    rate("S");
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    skip();
    rate("B");
    rate("C");

    expect(onComplete).toHaveBeenCalledWith({ "m-2": "B", "m-3": "C" });
  });

  it("finishes on a skipped last item too", () => {
    const onComplete = vi.fn();
    render(<BattleVoting items={items} onComplete={onComplete} />);

    rate("S");
    rate("A");
    skip();

    expect(onComplete).toHaveBeenCalledWith({ "m-1": "S", "m-2": "A" });
  });

  it("can finish with nothing rated at all", () => {
    const onComplete = vi.fn();
    render(<BattleVoting items={items} onComplete={onComplete} />);

    skip();
    skip();
    skip();

    expect(onComplete).toHaveBeenCalledWith({});
  });

  it("locks every control while the result is being submitted", () => {
    render(<BattleVoting items={items} onComplete={vi.fn()} submitting />);

    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
