import { describe, expect, it } from "vitest";
import {
  displayWidthFromSizes,
  isUnoptimizedSource,
  resizeCdnImage,
} from "@/lib/utils/image-source";
import { posterSizeForDisplay } from "@/lib/utils/tmdb-image";

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
    expect(isUnoptimizedSource("https://images.example.net/avatar.jpg")).toBe(false);
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

describe("posterSizeForDisplay", () => {
  it("reads the widest hint the card gives", () => {
    expect(posterSizeForDisplay("(max-width: 640px) 144px, 192px")).toBe("w185");
  });

  it("drops to the small buckets for the tiny cards", () => {
    // A battle roster row is 32px, a widget row 48px; w342 there was 43KB to
    // paint a thumbnail.
    expect(posterSizeForDisplay("32px")).toBe("w92");
    expect(posterSizeForDisplay("48px")).toBe("w154");
    expect(posterSizeForDisplay("64px")).toBe("w154");
  });

  it("stops at w185 however big the grid card is", () => {
    // Grids hold dozens of these; the pages that want more say so explicitly.
    expect(posterSizeForDisplay("120px")).toBe("w185");
    expect(posterSizeForDisplay("400px")).toBe("w185");
  });

  it("assumes the component's own default when the hint is not in pixels", () => {
    expect(posterSizeForDisplay("(max-width: 640px) 33vw, 180px")).toBe("w185");
    expect(posterSizeForDisplay(undefined)).toBe("w185");
    expect(posterSizeForDisplay("50vw")).toBe("w185");
  });
});

describe("isUnoptimizedSource — the hosts added after the first sweep", () => {
  it("covers AniList, which is the whole anime catalogue", () => {
    expect(isUnoptimizedSource("https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.jpg")).toBe(true);
    expect(isUnoptimizedSource("https://s1.anilist.co/file/anilistcdn/media/anime/banner/1.jpg")).toBe(true);
  });

  it("covers MyAnimeList, which serves those covers under the Jikan source", () => {
    expect(isUnoptimizedSource("https://cdn.myanimelist.net/images/anime/1/1.jpg")).toBe(true);
  });

  it("covers the YouTube image hosts, and only those Google hosts", () => {
    expect(isUnoptimizedSource("https://yt3.ggpht.com/abc=s800-c-k-no-rj")).toBe(true);
    expect(isUnoptimizedSource("https://yt3.googleusercontent.com/abc")).toBe(true);
    // Not every googleusercontent host is ours to bypass.
    expect(isUnoptimizedSource("https://lh3.googleusercontent.com/abc")).toBe(false);
  });

  it("covers the third Steam host the config allows", () => {
    expect(isUnoptimizedSource("https://cdn.cloudflare.steampowered.com/steam/apps/1/x.jpg")).toBe(true);
  });
});

describe("resizeCdnImage", () => {
  it("caps AniList covers at the medium variant for anything grid-sized", () => {
    const large = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-x.jpg";
    expect(resizeCdnImage(large, 112)).toContain("/cover/medium/");
    expect(resizeCdnImage(large, 180)).toContain("/cover/medium/");
    // Only a genuinely large tile earns the 460px file.
    expect(resizeCdnImage(large, 300)).toContain("/cover/large/");
  });

  it("asks YouTube for the size the circle is painted at", () => {
    const avatar = "https://yt3.ggpht.com/abc=s800-c-k-c0x00ffffff-no-rj";
    expect(resizeCdnImage(avatar, 32)).toBe("https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj");
    expect(resizeCdnImage(avatar, 120)).toBe("https://yt3.ggpht.com/abc=s240-c-k-c0x00ffffff-no-rj");
  });

  it("rewrites a TMDB width that was baked into a finished url", () => {
    // The search dropdown stores w185 urls and paints them at 32px.
    expect(resizeCdnImage("https://image.tmdb.org/t/p/w185/x.jpg", 32)).toBe(
      "https://image.tmdb.org/t/p/w92/x.jpg"
    );
  });

  it("leaves alone what it does not recognise", () => {
    const steam = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1/library_600x900.jpg";
    expect(resizeCdnImage(steam, 120)).toBe(steam);
    expect(resizeCdnImage("https://example.com/x.jpg", 50)).toBe("https://example.com/x.jpg");
    // A YouTube banner carries no size to swap, and is 45KB as stored.
    const banner = "https://yt3.googleusercontent.com/WKNko-abc";
    expect(resizeCdnImage(banner, 1280)).toBe(banner);
  });
});

describe("displayWidthFromSizes", () => {
  it("takes the widest px in the hint", () => {
    expect(displayWidthFromSizes("(max-width: 640px) 144px, 192px")).toBe(192);
    expect(displayWidthFromSizes("48px")).toBe(48);
  });

  it("falls back when the hint has no pixels", () => {
    expect(displayWidthFromSizes("100vw", 180)).toBe(180);
    expect(displayWidthFromSizes(undefined, 120)).toBe(120);
  });
});

describe("resizeCdnImage — the avatar sizes each surface actually paints", () => {
  const avatar = "https://yt3.ggpht.com/abc=s800-c-k-c0x00ffffff-no-rj";

  it("takes s176 for the 56px circle on the catalogue", () => {
    // discover-channel-card renders it at w-14; the component's own 120px
    // fallback used to pull s240, four times the painted size.
    expect(resizeCdnImage(avatar, 56)).toContain("=s176-");
  });

  it("keeps s240 where the circle really is 120px", () => {
    expect(resizeCdnImage(avatar, 120)).toContain("=s240-");
  });
});
