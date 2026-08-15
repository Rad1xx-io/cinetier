import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const trackEvent = vi.fn();
vi.mock("@/lib/analytics/tracker", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

const { AffiliateLinks } = await import("@/components/media/affiliate-links");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const props = { titleId: "movie-27205", titleName: "Начало" };

describe("AffiliateLinks", () => {
  it("renders nothing when there are no links", () => {
    const { container } = render(<AffiliateLinks {...props} links={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when every link fails validation", () => {
    const { container } = render(
      <AffiliateLinks
        {...props}
        links={{ netflix: "https://evil.com/x", ivi: "javascript:alert(1)" }}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows a badge per valid service", () => {
    render(
      <AffiliateLinks
        {...props}
        links={{ kinopoisk: "https://kinopoisk.ru/film/1", okko: "https://okko.tv/movie/1" }}
      />
    );
    expect(screen.getByRole("link", { name: /Kinopoisk/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Okko/ })).toBeTruthy();
  });

  it("drops a forged link but keeps the honest one beside it", () => {
    render(
      <AffiliateLinks
        {...props}
        links={{ kinopoisk: "https://kinopoisk.ru/film/1", netflix: "https://evil.com/phish" }}
      />
    );
    expect(screen.getByRole("link", { name: /Kinopoisk/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Netflix/ })).toBeNull();
  });

  it("opens in a new tab without handing over the opener", () => {
    render(<AffiliateLinks {...props} links={{ ivi: "https://ivi.ru/watch/1" }} />);
    const link = screen.getByRole("link", { name: /IVI/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer sponsored");
    expect(link.getAttribute("href")).toBe("https://ivi.ru/watch/1");
  });

  it("discloses that the links earn money", () => {
    render(<AffiliateLinks {...props} links={{ ivi: "https://ivi.ru/watch/1" }} />);
    expect(screen.getByText(/may earn a commission/)).toBeTruthy();
  });

  it("reports the click with the title and the destination", () => {
    render(<AffiliateLinks {...props} links={{ ivi: "https://ivi.ru/watch/1" }} />);
    screen.getByRole("link", { name: /IVI/ }).click();

    expect(trackEvent).toHaveBeenCalledWith("affiliate_link_clicked", {
      title_id: "movie-27205",
      title_name: "Начало",
      provider: "ivi",
      url: "https://ivi.ru/watch/1",
    });
  });

  it("reports each service separately", () => {
    render(
      <AffiliateLinks
        {...props}
        links={{ ivi: "https://ivi.ru/watch/1", okko: "https://okko.tv/movie/1" }}
      />
    );
    screen.getByRole("link", { name: /IVI/ }).click();
    screen.getByRole("link", { name: /Okko/ }).click();

    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(trackEvent).toHaveBeenLastCalledWith(
      "affiliate_link_clicked",
      expect.objectContaining({ provider: "okko" })
    );
  });
});
