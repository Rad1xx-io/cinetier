import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

/**
 * The redirect sanitizer, against the parser rather than against a wordlist.
 *
 * The bug this suite exists for: the previous implementation checked the raw
 * string for `//` and `\` and then handed the value to `new URL()`, which
 * strips ASCII tab/LF/CR *before* parsing. `%09`, `%0a` and `%0d` arrive
 * decoded from `searchParams.get()`, survived every string check, and then
 * turned into `//evil.com` inside the parser.
 *
 * Each blocked case below asserts the fallback rather than merely "not the
 * input", and the re-resolution guard at the bottom is the one that catches
 * the version of this fix that only compares origins.
 */

/** What the auth callback does with the result, so the assertion is end-to-end. */
function resolvedBy(caller: string, base = "https://tierlistonline.com/auth/callback"): string {
  return new URL(caller, base).href;
}

describe("safeRedirectPath — values that must be allowed through", () => {
  it.each([
    ["/", "/"],
    ["/profile", "/profile"],
    ["/lists/123", "/lists/123"],
    ["/lists/123?x=1", "/lists/123?x=1"],
    ["/lists/123#abc", "/lists/123#abc"],
    ["/lists/123?x=1&y=2#abc", "/lists/123?x=1&y=2#abc"],
    ["/settings", "/settings"],
    // Carried over from the suite this file replaced: the real destinations
    // the app itself passes.
    ["/tier-list", "/tier-list"],
    ["/u/someone", "/u/someone"],
    ["/settings#export", "/settings#export"],
  ])("keeps %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it("keeps a path whose query holds an encoded url, without following it", () => {
    // The value is data, not a destination — it must survive, and it must not
    // turn the redirect into one.
    const out = safeRedirectPath("/search?q=https%3A%2F%2Fevil.com");
    expect(out.startsWith("/search")).toBe(true);
    expect(resolvedBy(out).startsWith("https://tierlistonline.com/")).toBe(true);
  });
});

describe("safeRedirectPath — values that must be refused", () => {
  const blocked: [string, string][] = [
    ["absolute https", "https://evil.com"],
    ["absolute http", "http://evil.com"],
    ["protocol-relative", "//evil.com"],
    ["backslash", "/\\evil.com"],
    ["double backslash", "\\\\evil.com"],
    ["encoded tab", "/\t/evil.com"],
    ["encoded newline", "/\n/evil.com"],
    ["encoded carriage return", "/\r/evil.com"],
    ["tab then encoded slashes", "/\t//evil.com"],
    ["CRLF", "/\r\n/evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    ["scheme-relative with credentials", "//user:pass@evil.com"],
    ["uppercase scheme", "HTTPS://evil.com"],
    ["scheme with whitespace", " https://evil.com"],
    ["dot-segment escape", "/..//evil.com"],
    ["dot-segment escape via ./", "/./..//evil.com"],
    ["deep dot-segment escape", "/a/../../..//evil.com"],
    ["mixed decoded control char and slashes", "/\t/\\evil.com"],
    ["absolute url with an example host", "https://evil.example.com"],
    ["absolute http url with a path", "http://evil.example.com/x"],
    ["protocol-relative with an example host", "//evil.example.com"],
    // A mid-path backslash. The parser would fold it to `/` and quietly
    // resolve this to `/other` — same-origin and harmless, but not where
    // anyone asked to go, so it is refused outright. Carried over from the
    // suite this file replaced, where it was already the expected answer.
    ["backslash inside the path", "/path\\..\\other"],
  ];

  it.each(blocked)("blocks %s", (_name, input) => {
    expect(safeRedirectPath(input)).toBe("/");
  });

  it.each(blocked)("blocks %s even after the caller re-resolves it", (_name, input) => {
    // The property that actually matters: whatever comes back, feeding it to
    // `new URL(value, requestUrl)` must not leave this origin.
    const out = safeRedirectPath(input);
    expect(resolvedBy(out).startsWith("https://tierlistonline.com/")).toBe(true);
  });
});

describe("safeRedirectPath — the percent-encoded forms an attacker actually sends", () => {
  /**
   * The real transport. `searchParams.get()` percent-decodes, so `%09` becomes
   * a literal tab before the sanitizer ever runs — which is precisely how the
   * previous implementation was bypassed.
   */
  function throughQueryString(encoded: string): string {
    const url = new URL(`https://tierlistonline.com/auth/callback?redirect_to=${encoded}`);
    return safeRedirectPath(url.searchParams.get("redirect_to"));
  }

  it.each([
    "/%09/evil.com",
    "/%0A/evil.com",
    "/%0a/evil.com",
    "/%0D/evil.com",
    "/%0d/evil.com",
    "/%09%2F%2Fevil.com",
    "/%0D%0A/evil.com",
    "/%5Cevil.com",
    "/%5C%5Cevil.com",
    "%2F%2Fevil.com",
    "/%09%5Cevil.com",
  ])("blocks %s sent through the query string", (encoded) => {
    const out = throughQueryString(encoded);
    expect(resolvedBy(out).startsWith("https://tierlistonline.com/")).toBe(true);
  });

  it("still allows an ordinary encoded path through the query string", () => {
    expect(throughQueryString("%2Ftier-list")).toBe("/tier-list");
  });
});

describe("safeRedirectPath — degenerate input", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
  ])("falls back for %s", (_name, input) => {
    expect(safeRedirectPath(input)).toBe("/");
  });

  it("honours a caller-supplied fallback", () => {
    expect(safeRedirectPath("https://evil.com", "/settings")).toBe("/settings");
  });

  it("does not throw on a malformed url", () => {
    expect(() => safeRedirectPath("http://[")).not.toThrow();
    expect(safeRedirectPath("http://[")).toBe("/");
  });
});
