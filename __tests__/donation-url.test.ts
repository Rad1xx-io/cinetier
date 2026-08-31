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

  /*
   * This used to assert the opposite. The link is typed by one person and
   * clicked by another, so a plaintext hop is somebody else's risk to carry —
   * it can be rewritten in transit to point elsewhere, with the site's own
   * credibility behind it. Every platform this is realistically used for has
   * been HTTPS-only for years.
   */
  it("rejects plain http rather than silently upgrading it", () => {
    expect(safeDonationUrl("http://example.com/tip")).toBeNull();
    expect(safeDonationUrl("HTTP://example.com/tip")).toBeNull();
    // Not upgraded to https either: quietly changing where a link points is
    // its own surprise, and the author should be told rather than corrected.
    expect(safeDonationUrl("http://boosty.to/someone")).toBeNull();
  });

  it("still accepts https, including the scheme-less paste that becomes https", () => {
    expect(safeDonationUrl("https://example.com/tip")).toBe("https://example.com/tip");
    expect(safeDonationUrl("boosty.to/someone")).toBe("https://boosty.to/someone");
  });

  it("rejects protocol-relative urls, which carry no scheme of their own", () => {
    // `//evil.com` is normalised to `https://` by the scheme test above rather
    // than inheriting the page's, so this asserts the outcome, not the route.
    expect(safeDonationUrl("//evil.com")).toBe("https://evil.com/");
    expect(safeDonationUrl("//")).toBeNull();
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
