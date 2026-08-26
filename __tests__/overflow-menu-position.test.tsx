import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { OverflowMenu } from "@/components/ui/overflow-menu";

afterEach(cleanup);

/**
 * jsdom does no layout, so `getBoundingClientRect` always answers zeros unless
 * a test says otherwise. These stand in for the two shapes a toolbar takes:
 * the trigger sitting at the visible right edge of a row that fits on one
 * line, and the trigger wrapped onto a new line of its own — which is what a
 * fourth button (the "Custom" link) started doing to the tier-list toolbar at
 * 375px.
 */
function stubViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

function stubTriggerRect(rect: { left: number; right: number; bottom: number }) {
  vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: rect.left,
    right: rect.right,
    top: 0,
    bottom: rect.bottom,
    width: rect.right - rect.left,
    height: 32,
    x: rect.left,
    y: 0,
    toJSON: () => "",
  });
}

afterEach(() => vi.restoreAllMocks());

describe("where the panel lands", () => {
  it("stays on screen when the trigger sits at the right edge of a full-width row", () => {
    stubViewport(1280);
    stubTriggerRect({ left: 1209, right: 1241, bottom: 149 });
    render(<OverflowMenu label="More list actions" items={[{ label: "Download PNG" }]} />);

    fireEvent.click(screen.getByRole("button", { name: "More list actions" }));
    const panel = screen.getByRole("menu");
    const left = Number.parseFloat(panel.style.left);

    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 208).toBeLessThanOrEqual(1280);
  });

  it("stays on screen when the trigger has wrapped onto the left edge of its own line", () => {
    // The exact shape that shipped broken: four buttons no longer fit on one
    // 375px line, the trigger wraps to x=16, and a panel whose right edge
    // used to be pinned to the trigger's right edge landed at x=-160 — off
    // the left edge of the phone entirely.
    stubViewport(375);
    stubTriggerRect({ left: 16, right: 48, bottom: 180 });
    render(<OverflowMenu label="More list actions" items={[{ label: "Download PNG" }]} />);

    fireEvent.click(screen.getByRole("button", { name: "More list actions" }));
    const panel = screen.getByRole("menu");
    const left = Number.parseFloat(panel.style.left);

    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 208).toBeLessThanOrEqual(375);
  });

  it("keeps a comfortable trigger's usual position — opening left of the button, not just anywhere legal", () => {
    // With room to spare, the panel should still hang from the trigger the
    // way it always has; clamping only needs to act once space runs out.
    stubViewport(1280);
    stubTriggerRect({ left: 1209, right: 1241, bottom: 149 });
    render(<OverflowMenu label="More list actions" items={[{ label: "Download PNG" }]} />);

    fireEvent.click(screen.getByRole("button", { name: "More list actions" }));
    const panel = screen.getByRole("menu");
    expect(Number.parseFloat(panel.style.left)).toBe(1241 - 208);
  });
});

describe("stacking above the sticky filter bar", () => {
  it("paints above z-30, the tier list's own sticky Toolbar", () => {
    // The other half of the reported bug: the panel used to ship at the same
    // z-30 as `components/tier-list/toolbar.tsx`'s sticky wrapper, and a tie
    // is broken by DOM order — the filter bar comes later in the markup and
    // painted over the panel, leaving only whatever poked out past its edge.
    stubViewport(1280);
    stubTriggerRect({ left: 1209, right: 1241, bottom: 149 });
    render(<OverflowMenu label="More list actions" items={[{ label: "Download PNG" }]} />);

    fireEvent.click(screen.getByRole("button", { name: "More list actions" }));
    // jsdom never loads the compiled stylesheet, so the Tailwind class itself
    // is what a test here can check — not its computed effect.
    expect(screen.getByRole("menu").className).toMatch(/\bz-40\b/);
    expect(screen.getByRole("menu").className).not.toMatch(/\bz-30\b/);
  });
});
