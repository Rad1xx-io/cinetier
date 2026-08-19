import { describe, expect, it } from "vitest";
import { isUnoptimizedSource } from "@/lib/utils/image-source";

describe("isUnoptimizedSource", () => {
  it("sends TMDB posters straight to the CDN", () => {
    // The reason this exists: Vercel's optimizer answers 402 once the plan's
    // quota is spent, and a catalogue is mostly covers nobody has requested yet.
    expect(isUnoptimizedSource("https://image.tmdb.org/t/p/w342/abc.jpg")).toBe(true);
  });

  it("keeps Steam art off the optimizer, as it always was", () => {
    expect(
      isUnoptimizedSource("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1/x.jpg")
    ).toBe(true);
    expect(isUnoptimizedSource("https://steamcdn-a.akamaihd.net/steam/apps/1/header.jpg")).toBe(true);
  });

  it("covers IGDB, which arrives through the same component", () => {
    expect(
      isUnoptimizedSource("https://images.igdb.com/igdb/image/upload/t_cover_big/co1rs4.jpg")
    ).toBe(true);
  });

  it("leaves everything else to the optimizer", () => {
    expect(isUnoptimizedSource("https://example.com/poster.jpg")).toBe(false);
    expect(isUnoptimizedSource("https://yt3.ggpht.com/avatar.jpg")).toBe(false);
  });

  it("matches the host, not the text of the url", () => {
    // A path is upstream input; it must not talk its way onto the list.
    expect(isUnoptimizedSource("https://evil.example/image.tmdb.org/x.jpg")).toBe(false);
    expect(isUnoptimizedSource("https://image.tmdb.org.evil.example/x.jpg")).toBe(false);
  });

  it("says no to a relative path and to nothing at all", () => {
    expect(isUnoptimizedSource("/_next/image?url=%2Flocal.jpg")).toBe(false);
    expect(isUnoptimizedSource(null)).toBe(false);
    expect(isUnoptimizedSource("")).toBe(false);
  });
});
