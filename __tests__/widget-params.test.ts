import { describe, expect, it } from "vitest";
import { buildWidgetUrl, parseWidgetParams, WIDGET_DEFAULTS } from "@/lib/widgets/params";

const parse = (query: string) => parseWidgetParams(new URLSearchParams(query));

describe("parseWidgetParams", () => {
  it("falls back to the defaults on an empty query", () => {
    expect(parse("")).toEqual(WIDGET_DEFAULTS);
    expect(parseWidgetParams(null)).toEqual(WIDGET_DEFAULTS);
    expect(parseWidgetParams(undefined)).toEqual(WIDGET_DEFAULTS);
  });

  it("defaults to a transparent background", () => {
    expect(parse("").theme).toBe("transparent");
  });

  it("reads each theme", () => {
    expect(parse("theme=dark").theme).toBe("dark");
    expect(parse("theme=light").theme).toBe("light");
    expect(parse("theme=transparent").theme).toBe("transparent");
  });

  it("ignores case and stray whitespace in the theme", () => {
    expect(parse("theme=DARK").theme).toBe("dark");
    expect(parse("theme=%20light%20").theme).toBe("light");
  });

  // The URL is typed by hand into OBS, sometimes mid-broadcast. One bad value
  // should cost that one option, not the overlay.
  it("keeps the default for an unrecognised theme", () => {
    expect(parse("theme=neon").theme).toBe("transparent");
    expect(parse("theme=").theme).toBe("transparent");
  });

  it("accepts the spellings people actually type for booleans", () => {
    expect(parse("compact=true").compact).toBe(true);
    expect(parse("compact=1").compact).toBe(true);
    expect(parse("compact=yes").compact).toBe(true);
    expect(parse("showTitle=false").showTitle).toBe(false);
    expect(parse("showTitle=0").showTitle).toBe(false);
    expect(parse("showTitle=no").showTitle).toBe(false);
  });

  it("keeps the default for a boolean it cannot read", () => {
    expect(parse("compact=maybe").compact).toBe(false);
    expect(parse("showTitle=maybe").showTitle).toBe(true);
  });

  it("reads a tier limit", () => {
    expect(parse("limit=3").limit).toBe(3);
    expect(parse("limit=1").limit).toBe(1);
  });

  it("caps the limit at the number of tiers that exist", () => {
    expect(parse("limit=99").limit).toBe(7);
  });

  it("treats a limit below one, or unreadable, as no limit", () => {
    expect(parse("limit=0").limit).toBeNull();
    expect(parse("limit=-2").limit).toBeNull();
    expect(parse("limit=abc").limit).toBeNull();
    expect(parse("limit=").limit).toBeNull();
  });

  it("floors a fractional limit", () => {
    expect(parse("limit=2.9").limit).toBe(2);
  });

  it("reads the object form Next hands a page", () => {
    expect(parseWidgetParams({ theme: "dark", compact: "true" })).toEqual({
      theme: "dark",
      compact: true,
      showTitle: true,
      limit: null,
    });
  });

  it("takes the first value when a param is repeated", () => {
    expect(parseWidgetParams({ theme: ["light", "dark"] }).theme).toBe("light");
  });
});

describe("buildWidgetUrl", () => {
  it("writes nothing but the path when everything is default", () => {
    expect(buildWidgetUrl("https://cinetier.app", "owner", WIDGET_DEFAULTS)).toBe(
      "https://cinetier.app/widgets/tier-list/owner"
    );
  });

  it("writes only the options that were changed", () => {
    const url = buildWidgetUrl("https://cinetier.app", "owner", {
      theme: "dark",
      compact: true,
      showTitle: true,
      limit: null,
    });
    expect(url).toBe("https://cinetier.app/widgets/tier-list/owner?theme=dark&compact=true");
  });

  it("writes showTitle only when it is switched off", () => {
    const on = buildWidgetUrl("https://x.dev", "owner", { showTitle: true });
    const off = buildWidgetUrl("https://x.dev", "owner", { showTitle: false });
    expect(on).not.toContain("showTitle");
    expect(off).toContain("showTitle=false");
  });

  it("survives a trailing slash on the origin", () => {
    expect(buildWidgetUrl("https://cinetier.app/", "owner", {})).toBe(
      "https://cinetier.app/widgets/tier-list/owner"
    );
  });

  it("escapes a handle that would otherwise break the path", () => {
    expect(buildWidgetUrl("https://x.dev", "a b/c", {})).toBe(
      "https://x.dev/widgets/tier-list/a%20b%2Fc"
    );
  });

  it("round-trips through the parser", () => {
    const built = buildWidgetUrl("https://x.dev", "owner", {
      theme: "light",
      compact: true,
      showTitle: false,
      limit: 3,
    });
    const parsed = parseWidgetParams(new URL(built).searchParams);
    expect(parsed).toEqual({ theme: "light", compact: true, showTitle: false, limit: 3 });
  });
});
