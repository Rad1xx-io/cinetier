import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WidgetBranding } from "@/components/widgets/widget-branding";

afterEach(cleanup);

describe("WidgetBranding", () => {
  it("credits CineTier", () => {
    render(<WidgetBranding listId="owner" theme="transparent" />);
    expect(screen.getByRole("link", { name: /Powered by CineTier/ })).toBeTruthy();
  });

  // A board has no id of its own in CineTier — it belongs to a handle, so the
  // badge leads to that person's public page.
  it("links back to the author's public list", () => {
    render(<WidgetBranding listId="owner" theme="dark" />);
    expect(screen.getByRole("link", { name: /CineTier/ }).getAttribute("href")).toBe("/u/owner");
  });

  it("opens outside the overlay, without handing over the opener", () => {
    render(<WidgetBranding listId="owner" theme="dark" />);
    const link = screen.getByRole("link", { name: /CineTier/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("switches to dark text on the light theme", () => {
    render(<WidgetBranding listId="owner" theme="light" />);
    expect(screen.getByRole("link", { name: /CineTier/ }).className).toContain("text-black/55");
  });

  it("stays legible over an unknown stream frame on the transparent theme", () => {
    render(<WidgetBranding listId="owner" theme="transparent" />);
    const className = screen.getByRole("link", { name: /CineTier/ }).className;
    expect(className).toContain("text-white/65");
    expect(className).toContain("backdrop-blur-sm");
  });

  it("accepts extra positioning from its caller", () => {
    render(<WidgetBranding listId="owner" theme="dark" className="mt-1.5" />);
    expect(screen.getByRole("link", { name: /CineTier/ }).className).toContain("mt-1.5");
  });
});
