import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Opt-in escape hatch for NAT64 networks, set only in .env.local.
     *
     * Next 16 refuses to optimize an image whose hostname resolves to a private
     * address. On an IPv6-only link with NAT64 — a phone hotspot, for instance —
     * every public host resolves through the 64:ff9b::/96 prefix, which trips
     * that check and turns every remote cover into a broken image locally.
     * Hosting platforms have ordinary dual-stack DNS and never hit this, so the
     * relaxation stays off unless the developer asks for it, and `remotePatterns`
     * below still limits fetches to the known CDNs either way.
     */
    dangerouslyAllowLocalIP: process.env.ALLOW_LOCAL_IP_IMAGES === "true",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "yt3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "yt3.ggpht.com",
      },
      {
        protocol: "https",
        hostname: "s4.anilist.co",
      },
      {
        protocol: "https",
        hostname: "s1.anilist.co",
      },
      {
        protocol: "https",
        hostname: "s2.anilist.co",
      },
      // MyAnimeList, reached through Jikan. Kept alongside the AniList hosts
      // rather than replacing them: boards saved while AniList was the source
      // still hold s4.anilist.co poster URLs, and dropping the host would blank
      // every one of them.
      {
        protocol: "https",
        hostname: "cdn.myanimelist.net",
      },
      // Steam serves the same asset from several CDNs and swaps between them
      // per request, so match the whole family rather than chasing hostnames.
      {
        protocol: "https",
        hostname: "**.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "**.akamaihd.net",
      },
      {
        protocol: "https",
        hostname: "**.steampowered.com",
      },
      {
        protocol: "https",
        hostname: "images.igdb.com",
      },
    ],
  },

  /**
   * The films section lives at /discover, which is what it was called when the
   * app had one catalogue. /films is where a reader — and a search engine —
   * looks for it, and it has only ever returned a 404.
   *
   * Permanent, so the redirect is cached and the target inherits any ranking
   * the wrong URL picked up. Exact path only: there are no pages under /films
   * to forward.
   */
  async redirects() {
    return [
      {
        source: "/films",
        destination: "/discover",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
