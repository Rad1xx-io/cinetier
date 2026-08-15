import { describe, expect, it } from "vitest";
import { donationUrlHost, safeDonationUrl } from "@/lib/utils/donation-url";

describe("safeDonationUrl", () => {
  it("keeps ordinary donation links", () => {
    expect(safeDonationUrl("https://boosty.to/someone")).toBe("https://boosty.to/someone");
    expect(safeDonationUrl("https://pay.cloudtips.ru/p/abc123")).toBe(
      "https://pay.cloudtips.ru/p/abc123"
    );
  });

  it("adds https to a link pasted without a scheme", () => {
    expect(safeDonationUrl("boosty.to/someone")).toBe("https://boosty.to/someone");
    expect(safeDonationUrl("www.patreon.com/someone")).toBe("https://www.patreon.com/someone");
  });

  it("allows plain http, since some tip jars still are", () => {
    expect(safeDonationUrl("http://example.com/tip")).toBe("http://example.com/tip");
  });

  // The whole reason this function exists: the value is typed by one user and
  // clicked by another, so a script URI here would run in the visitor's tab.
  it("rejects executable and non-network schemes", () => {
    expect(safeDonationUrl("javascript:alert(1)")).toBeNull();
    expect(safeDonationUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeDonationUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeDonationUrl("file:///etc/passwd")).toBeNull();
    expect(safeDonationUrl("vbscript:msgbox(1)")).toBeNull();
  });

  it("resolves a protocol-relative value to https", () => {
    // Unlike a redirect target, an off-site host is the entire point of this
    // field — every donation link leaves the origin. Only the scheme is a
    // hazard, so "//host" is normalised rather than refused.
    expect(safeDonationUrl("//boosty.to/x")).toBe("https://boosty.to/x");
  });

  it("rejects anything without a real host", () => {
    expect(safeDonationUrl("https://")).toBeNull();
    expect(safeDonationUrl("https://localhost")).toBeNull();
    expect(safeDonationUrl("not a url at all")).toBeNull();
  });

  it("treats blank input as absent", () => {
    expect(safeDonationUrl(null)).toBeNull();
    expect(safeDonationUrl(undefined)).toBeNull();
    expect(safeDonationUrl("")).toBeNull();
    expect(safeDonationUrl("   ")).toBeNull();
  });

  it("trims surrounding whitespace from a pasted link", () => {
    expect(safeDonationUrl("  https://boosty.to/x  ")).toBe("https://boosty.to/x");
  });
});

describe("donationUrlHost", () => {
  it("names where the link leads, without the www", () => {
    expect(donationUrlHost("https://www.patreon.com/someone")).toBe("patreon.com");
    expect(donationUrlHost("boosty.to/x")).toBe("boosty.to");
  });

  it("is null for anything the validator rejects", () => {
    expect(donationUrlHost("javascript:alert(1)")).toBeNull();
    expect(donationUrlHost(null)).toBeNull();
  });
});
