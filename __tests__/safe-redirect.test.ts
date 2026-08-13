import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps ordinary in-app paths", () => {
    expect(safeRedirectPath("/tier-list")).toBe("/tier-list");
    expect(safeRedirectPath("/u/someone")).toBe("/u/someone");
    expect(safeRedirectPath("/settings#export")).toBe("/settings#export");
  });

  it("refuses an absolute url", () => {
    expect(safeRedirectPath("https://evil.example.com")).toBe("/");
    expect(safeRedirectPath("http://evil.example.com/x")).toBe("/");
  });

  it("refuses a protocol-relative url", () => {
    expect(safeRedirectPath("//evil.example.com")).toBe("/");
  });

  it("refuses backslash variants browsers may normalise to a slash", () => {
    expect(safeRedirectPath("/\\evil.example.com")).toBe("/");
    expect(safeRedirectPath("/path\\..\\other")).toBe("/");
  });

  it("falls back when the value is missing", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("honours a custom fallback", () => {
    expect(safeRedirectPath(null, "/settings")).toBe("/settings");
  });
});
