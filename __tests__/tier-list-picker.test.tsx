import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TierListPicker, type CatalogCounts } from "@/components/tier-list/tier-list-picker";
import { firstStockedCatalog, type ContentType } from "@/lib/utils/content-type";

const counts: CatalogCounts = { movie: 8, tv: 0, anime: 3, game: 0, youtube: 2 };

function renderPicker(value: ContentType = "movie") {
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

  it("offers the five catalogs and nothing that mixes them", () => {
    const { open } = renderPicker();
    open();

    const options = screen.getAllByRole("menuitemradio").map((el) => el.textContent ?? "");
    expect(options).toHaveLength(5);
    // A tier holding films, games and channels together ranks them against each
    // other, which is not a comparison anybody made.
    expect(options.some((label) => /^all/i.test(label))) .toBe(false);
    expect(screen.queryByRole("menuitemradio", { name: /^all/i })).toBeNull();
  });

  it("marks the open list as the chosen one", () => {
    const { open } = renderPicker("movie");
    open();

    expect(
      screen.getByRole("menuitemradio", { name: /films/i }).getAttribute("aria-checked")
    ).toBe("true");
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

describe("which list opens first", () => {
  it("opens on the first catalog that actually holds something", () => {
    expect(firstStockedCatalog({ movie: 0, tv: 0, anime: 4, game: 2, youtube: 0 })).toBe("anime");
    expect(firstStockedCatalog({ movie: 0, tv: 0, anime: 0, game: 0, youtube: 7 })).toBe("youtube");
  });

  it("prefers films when several hold something, so the order is predictable", () => {
    expect(firstStockedCatalog({ movie: 1, tv: 9, anime: 9, game: 9, youtube: 9 })).toBe("movie");
  });

  it("falls back to films for somebody who has ranked nothing at all", () => {
    expect(firstStockedCatalog({ movie: 0, tv: 0, anime: 0, game: 0, youtube: 0 })).toBe("movie");
  });
});
