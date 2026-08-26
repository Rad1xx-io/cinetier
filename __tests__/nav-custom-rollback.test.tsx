import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  DESKTOP_NAV_RIGHT,
  NAV_ITEMS,
} from "@/components/navigation/nav-items";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/tier-list") }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: null, loading: false }),
}));
vi.mock("@/components/navigation/global-search", () => ({ GlobalSearch: () => null }));
vi.mock("@/components/navigation/auth-area", () => ({ AuthArea: () => null }));

import { TopNav } from "@/components/navigation/top-nav";
import { BottomNav } from "@/components/navigation/bottom-nav";

afterEach(cleanup);

describe("Custom is out of the navigation again", () => {
  it("is not one of the seven mobile tabs — Settings has its slot back", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Tier list",
      "Feed",
      "Films",
      "Anime",
      "YouTube",
      "Games",
      "Settings",
    ]);
  });

  it("is not in the desktop header's right-hand group", () => {
    expect(DESKTOP_NAV_RIGHT.map((i) => i.label)).toEqual(["YouTube", "Games"]);
  });

  it("renders the tier-list tab as a single link, not a segmented pair", () => {
    render(<TopNav />);
    expect(screen.getByRole("link", { name: "Tier list" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Custom" })).toBeNull();
  });

  it("shows seven tabs on the phone, Settings among them, Custom nowhere", () => {
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const labels = [...nav.querySelectorAll("a")].map((a) => a.textContent);
    expect(labels).toHaveLength(7);
    expect(labels).toContain("Settings");
    expect(labels).not.toContain("Custom");
  });
});
