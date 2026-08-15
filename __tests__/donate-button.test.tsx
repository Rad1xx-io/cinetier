import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const trackEvent = vi.fn();
vi.mock("@/lib/analytics/tracker", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

const { DonateButton } = await import("@/components/profile/donate-button");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const base = { authorId: "a1", authorName: "Anya" };

describe("DonateButton — nothing to show", () => {
  // An author who set no link should cost the layout nothing, in either
  // variant: a feed row closes up, and a list gets no empty banner.
  it.each(["compact", "card"] as const)("renders nothing in the %s variant", (variant) => {
    const { container } = render(<DonateButton {...base} donationUrl={null} variant={variant} />);
    expect(container.innerHTML).toBe("");
  });

  it.each(["compact", "card"] as const)("renders nothing for a blank link (%s)", (variant) => {
    const { container } = render(<DonateButton {...base} donationUrl="   " variant={variant} />);
    expect(container.innerHTML).toBe("");
  });

  // A stored value can predate the CHECK constraint, so the component does not
  // trust what it is handed.
  it.each(["compact", "card"] as const)("renders nothing for a script URI (%s)", (variant) => {
    const { container } = render(
      <DonateButton {...base} donationUrl="javascript:alert(1)" variant={variant} />
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("DonateButton — compact", () => {
  it("is the default variant", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" />);
    expect(screen.getByRole("link", { name: "Support" })).toBeTruthy();
  });

  it("keeps its label short, naming the author in the tooltip instead", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" variant="compact" />);
    const link = screen.getByRole("link", { name: "Support" });
    expect(link.textContent?.trim()).toBe("Support");
    expect(link.getAttribute("title")).toBe("Support Anya — opens boosty.to");
  });

  it("opens in a new tab without leaking the opener", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" variant="compact" />);
    const link = screen.getByRole("link", { name: "Support" });
    expect(link.getAttribute("href")).toBe("https://boosty.to/anya");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("normalises a link saved without a scheme", () => {
    render(<DonateButton {...base} donationUrl="boosty.to/anya" variant="compact" />);
    expect(screen.getByRole("link", { name: "Support" }).getAttribute("href")).toBe(
      "https://boosty.to/anya"
    );
  });

  it("accepts positioning from its caller", () => {
    render(
      <DonateButton {...base} donationUrl="https://boosty.to/anya" className="ml-auto" />
    );
    expect(screen.getByRole("link", { name: "Support" }).className).toContain("ml-auto");
  });
});

describe("DonateButton — card", () => {
  it("asks properly, naming the author", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" variant="card" />);
    expect(screen.getByRole("heading", { name: "Enjoyed this list?" })).toBeTruthy();
    expect(screen.getByText(/Support Anya/)).toBeTruthy();
  });

  it("says TierListOnline takes no cut", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" variant="card" />);
    expect(screen.getByText(/takes no cut/)).toBeTruthy();
  });

  it("names the destination before the click", () => {
    render(<DonateButton {...base} donationUrl="https://www.patreon.com/anya" variant="card" />);
    expect(screen.getByText("Opens patreon.com in a new tab")).toBeTruthy();
  });

  it("carries the same link and the same safety attributes", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" variant="card" />);
    const link = screen.getByRole("link", { name: /Support the creator/ });
    expect(link.getAttribute("href")).toBe("https://boosty.to/anya");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("DonateButton — reporting", () => {
  it("reports the click with the recipient", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" />);
    screen.getByRole("link", { name: "Support" }).click();

    expect(trackEvent).toHaveBeenCalledWith("donate_button_clicked", { recipient_id: "a1" });
  });

  it("includes the board when there is one to name", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" tierListId="post-7" />);
    screen.getByRole("link", { name: "Support" }).click();

    expect(trackEvent).toHaveBeenCalledWith("donate_button_clicked", {
      recipient_id: "a1",
      tier_list_id: "post-7",
    });
  });

  it("reports the same event from the card variant", () => {
    render(
      <DonateButton {...base} donationUrl="https://boosty.to/anya" variant="card" tierListId="b2" />
    );
    screen.getByRole("link", { name: /Support the creator/ }).click();

    expect(trackEvent).toHaveBeenCalledWith("donate_button_clicked", {
      recipient_id: "a1",
      tier_list_id: "b2",
    });
  });
});
