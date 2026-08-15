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

describe("DonateButton", () => {
  it("renders nothing when the author set no link", () => {
    const { container } = render(
      <DonateButton authorId="a1" authorName="Аня" donationUrl={null} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for an empty or blank link", () => {
    const { container } = render(<DonateButton authorId="a1" authorName="Аня" donationUrl="   " />);
    expect(container.innerHTML).toBe("");
  });

  // A stored value can predate the CHECK constraint, so the component does not
  // trust what it is handed.
  it("renders nothing for a script URI, whatever the caller passed", () => {
    const { container } = render(
      <DonateButton authorId="a1" authorName="Аня" donationUrl="javascript:alert(1)" />
    );
    expect(container.innerHTML).toBe("");
  });

  it("names the author and points at their link", () => {
    render(<DonateButton authorId="a1" authorName="Аня" donationUrl="https://boosty.to/anya" />);
    const link = screen.getByRole("link", { name: /Поддержать Аня/ });
    expect(link.getAttribute("href")).toBe("https://boosty.to/anya");
  });

  it("opens in a new tab without leaking the opener", () => {
    render(<DonateButton authorId="a1" authorName="Аня" donationUrl="https://boosty.to/anya" />);
    const link = screen.getByRole("link", { name: /Поддержать/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("says where the link leads before it is clicked", () => {
    render(
      <DonateButton authorId="a1" authorName="Аня" donationUrl="https://www.patreon.com/anya" />
    );
    expect(screen.getByRole("link", { name: /Поддержать/ }).getAttribute("title")).toBe(
      "Открыть patreon.com в новой вкладке"
    );
  });

  it("reports the click with the recipient", () => {
    render(<DonateButton authorId="a1" authorName="Аня" donationUrl="https://boosty.to/anya" />);
    screen.getByRole("link", { name: /Поддержать/ }).click();

    expect(trackEvent).toHaveBeenCalledWith("donate_button_clicked", { recipient_id: "a1" });
  });

  it("includes the board when there is one to name", () => {
    render(
      <DonateButton
        authorId="a1"
        authorName="Аня"
        donationUrl="https://boosty.to/anya"
        tierListId="post-7"
      />
    );
    screen.getByRole("link", { name: /Поддержать/ }).click();

    expect(trackEvent).toHaveBeenCalledWith("donate_button_clicked", {
      recipient_id: "a1",
      tier_list_id: "post-7",
    });
  });

  it("normalises a link saved without a scheme", () => {
    render(<DonateButton authorId="a1" authorName="Аня" donationUrl="boosty.to/anya" />);
    expect(screen.getByRole("link", { name: /Поддержать/ }).getAttribute("href")).toBe(
      "https://boosty.to/anya"
    );
  });
});
