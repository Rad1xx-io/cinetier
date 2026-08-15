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

const base = { authorId: "a1", authorName: "Аня" };

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
    expect(screen.getByRole("link", { name: "Поддержать" })).toBeTruthy();
  });

  it("keeps its label short, naming the author in the tooltip instead", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" variant="compact" />);
    const link = screen.getByRole("link", { name: "Поддержать" });
    expect(link.textContent?.trim()).toBe("Поддержать");
    expect(link.getAttribute("title")).toBe("Поддержать Аня — откроется boosty.to");
  });

  it("opens in a new tab without leaking the opener", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" variant="compact" />);
    const link = screen.getByRole("link", { name: "Поддержать" });
    expect(link.getAttribute("href")).toBe("https://boosty.to/anya");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("normalises a link saved without a scheme", () => {
    render(<DonateButton {...base} donationUrl="boosty.to/anya" variant="compact" />);
    expect(screen.getByRole("link", { name: "Поддержать" }).getAttribute("href")).toBe(
      "https://boosty.to/anya"
    );
  });

  it("accepts positioning from its caller", () => {
    render(
      <DonateButton {...base} donationUrl="https://boosty.to/anya" className="ml-auto" />
    );
    expect(screen.getByRole("link", { name: "Поддержать" }).className).toContain("ml-auto");
  });
});

describe("DonateButton — card", () => {
  it("asks properly, naming the author", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" variant="card" />);
    expect(screen.getByRole("heading", { name: "Понравился список?" })).toBeTruthy();
    expect(screen.getByText(/Поддержите Аня/)).toBeTruthy();
  });

  it("says TierListOnline takes no cut", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" variant="card" />);
    expect(screen.getByText(/не берёт комиссию/)).toBeTruthy();
  });

  it("names the destination before the click", () => {
    render(<DonateButton {...base} donationUrl="https://www.patreon.com/anya" variant="card" />);
    expect(screen.getByText("Откроется patreon.com в новой вкладке")).toBeTruthy();
  });

  it("carries the same link and the same safety attributes", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" variant="card" />);
    const link = screen.getByRole("link", { name: /Поддержать автора/ });
    expect(link.getAttribute("href")).toBe("https://boosty.to/anya");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("DonateButton — reporting", () => {
  it("reports the click with the recipient", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" />);
    screen.getByRole("link", { name: "Поддержать" }).click();

    expect(trackEvent).toHaveBeenCalledWith("donate_button_clicked", { recipient_id: "a1" });
  });

  it("includes the board when there is one to name", () => {
    render(<DonateButton {...base} donationUrl="https://boosty.to/anya" tierListId="post-7" />);
    screen.getByRole("link", { name: "Поддержать" }).click();

    expect(trackEvent).toHaveBeenCalledWith("donate_button_clicked", {
      recipient_id: "a1",
      tier_list_id: "post-7",
    });
  });

  it("reports the same event from the card variant", () => {
    render(
      <DonateButton {...base} donationUrl="https://boosty.to/anya" variant="card" tierListId="b2" />
    );
    screen.getByRole("link", { name: /Поддержать автора/ }).click();

    expect(trackEvent).toHaveBeenCalledWith("donate_button_clicked", {
      recipient_id: "a1",
      tier_list_id: "b2",
    });
  });
});
