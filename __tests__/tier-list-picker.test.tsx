import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TierListPicker, type CatalogCounts } from "@/components/tier-list/tier-list-picker";
import type { CategoryFilter } from "@/lib/utils/content-type";

const counts: CatalogCounts = { movie: 8, tv: 0, anime: 3, game: 0, youtube: 2 };

function renderPicker(value: CategoryFilter = "all") {
  const onChange = vi.fn();
  render(<TierListPicker value={value} onChange={onChange} counts={counts} />);
  const trigger = screen.getByRole("button", { name: /choose a list/i });
  return { onChange, trigger, open: () => fireEvent.click(trigger) };
}

afterEach(cleanup);

describe("choosing which list the board shows", () => {
  it("names the list currently open, so the board is never unlabelled", () => {
    renderPicker("anime");
    expect(screen.getByRole("button", { name: /showing anime/i })).toBeTruthy();
  });

  it("totals every catalog behind the All entry", () => {
    const { open } = renderPicker();
    open();

    const all = screen.getByRole("menuitemradio", { name: /^all/i });
    expect(all.textContent).toContain("13");
    expect(all.getAttribute("aria-checked")).toBe("true");
  });

  it("shows an empty catalog as empty rather than hiding it", () => {
    const { open } = renderPicker();
    open();

    // "Nothing ranked here yet" and "this list is missing" are different things
    // to somebody looking for a list they know they made.
    expect(screen.getByRole("menuitemradio", { name: /^tv/i }).textContent).toContain("0");
  });

  it("reports the chosen list and closes", () => {
    const { onChange, open } = renderPicker();
    open();
    fireEvent.click(screen.getByRole("menuitemradio", { name: /games/i }));

    expect(onChange).toHaveBeenCalledWith("game");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape without changing the list, and gives focus back", () => {
    const { onChange, trigger, open } = renderPicker();
    open();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when the pointer goes down outside it", () => {
    const { open } = renderPicker();
    open();
    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
