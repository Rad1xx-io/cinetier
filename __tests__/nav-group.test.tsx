import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

let mockPathname = "/tier-list";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: null, loading: false }),
}));
vi.mock("@/components/navigation/global-search", () => ({ GlobalSearch: () => null }));
vi.mock("@/components/navigation/auth-area", () => ({ AuthArea: () => null }));

import { TopNav } from "@/components/navigation/top-nav";
import { BottomNav } from "@/components/navigation/bottom-nav";

afterEach(cleanup);

describe("the Games nav entry, on desktop", () => {
  it("renders as a menu trigger, not a direct link", () => {
    mockPathname = "/tier-list";
    render(<TopNav />);
    expect(screen.getByRole("button", { name: /games/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^games$/i })).toBeNull();
  });

  it("opens on click and offers PC and Mobile, each its own link", () => {
    mockPathname = "/tier-list";
    render(<TopNav />);
    fireEvent.click(screen.getByRole("button", { name: /games/i }));

    const pc = screen.getByRole("menuitemradio", { name: /pc/i });
    const mobile = screen.getByRole("menuitemradio", { name: /mobile/i });
    expect(pc.getAttribute("href")).toBe("/games/pc");
    expect(mobile.getAttribute("href")).toBe("/games/mobile");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    mockPathname = "/tier-list";
    render(<TopNav />);
    const trigger = screen.getByRole("button", { name: /games/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("reads as active from either of its own items, not just its hub", () => {
    mockPathname = "/games/mobile";
    render(<TopNav />);
    expect(screen.getByRole("button", { name: /games/i }).className).toContain("bg-surface-raised");
  });
});

describe("the Games nav entry, on the mobile tab bar", () => {
  it("links straight to the hub instead of opening a menu", () => {
    mockPathname = "/tier-list";
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const gamesLink = [...nav.querySelectorAll("a")].find((a) => a.textContent === "Games");
    expect(gamesLink?.getAttribute("href")).toBe("/games");
  });

  it("still shows exactly seven tabs — a group costs one slot, not two", () => {
    mockPathname = "/tier-list";
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav.querySelectorAll("a")).toHaveLength(7);
  });
});
