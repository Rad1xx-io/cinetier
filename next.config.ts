import type { NextConfig } from "next";

/**
 * The origin of a configured service, for the connect-src list below.
 *
 * Returns null rather than throwing when the variable is unset or unparseable:
 * every one of these integrations is optional (guest-only mode configures no
 * Supabase, most deployments configure no PostHog), and a policy that names a
 * service nobody uses is noise. `new URL().origin` strips any path, so a
 * variable someone set with a trailing path still yields a bare origin.
 */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Where the app is genuinely allowed to send and fetch.
 *
 * Built from the same environment variables the clients themselves read, so a
 * preview deployment pointed at a different Supabase project gets a policy that
 * matches it instead of one that silently blocks it.
 */
const SUPABASE_ORIGIN = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
const POSTHOG_ORIGIN = originOf(process.env.NEXT_PUBLIC_POSTHOG_HOST);

/**
 * The image CDNs, mirroring DIRECT_HOSTS in lib/utils/image-source.ts.
 *
 * Restated here rather than imported: next.config.ts is evaluated by Node
 * before the TypeScript path aliases exist, and a stale copy of this list only
 * ever shows up as a report-only violation, never as a broken image.
 */
const IMAGE_HOSTS = [
  "https://image.tmdb.org",
  "https://*.anilist.co",
  "https://cdn.myanimelist.net",
  "https://images.igdb.com",
  "https://*.steamstatic.com",
  "https://*.akamaihd.net",
  "https://*.steampowered.com",
  "https://yt3.googleusercontent.com",
  "https://*.ggpht.com",
];

/**
 * The full policy, shipped report-only.
 *
 * Enforcing this today would be a guess. Next's App Router injects inline
 * bootstrap and streaming scripts with no nonce plumbed through this app, so a
 * correct enforced `script-src` here is either `'unsafe-inline'` — which buys
 * little — or a nonce pipeline that touches every route. Report-only collects
 * the real violations from real traffic first; the directives that need no such
 * evidence are enforced separately below.
 */
function contentSecurityPolicyReportOnly(): string {
  const connect = ["'self'", SUPABASE_ORIGIN, POSTHOG_ORIGIN, "https://*.vercel-scripts.com"]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    // 'unsafe-inline' is listed because Next's own hydration scripts are
    // inline. It is exactly the thing the report-only run exists to measure
    // before anything is enforced. No 'unsafe-eval': nothing here needs it,
    // and a report will say so if that is ever wrong.
    "script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com",
    // Tailwind ships a stylesheet, but Radix and the tier plates set inline
    // custom properties, so style-src has to allow inline for now.
    "style-src 'self' 'unsafe-inline'",
    // Fonts are self-hosted: next/font/google downloads Geist at build time,
    // so no font CDN belongs here.
    "font-src 'self'",
    `img-src 'self' data: blob: ${[SUPABASE_ORIGIN, ...IMAGE_HOSTS].filter(Boolean).join(" ")}`,
    `connect-src ${connect}`,
    // The only iframe in the app is the widget preview, which is same-origin.
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * Headers every route gets, none of which depends on runtime evidence.
 *
 * HSTS is included because the production origin is served by Vercel, which
 * terminates TLS and has no plaintext listener to fall back to. Deliberately
 * without `includeSubDomains` and without `preload`: subdomains of this domain
 * are not enumerated anywhere in this repository, so committing them to
 * HTTPS-only is a promise this file is not in a position to make, and preload
 * is effectively irreversible.
 */
const BASELINE_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Nothing here uses any of them. The upload form is an ordinary file input,
    // which needs no camera permission.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

/**
 * The part of the policy that is enforced today, on every route.
 *
 * Separate from the report-only policy above because these three directives
 * need no runtime evidence to be safe. Each was checked against the source
 * rather than assumed:
 *
 *   * `object-src 'none'` — there is no `<object>` or `<embed>` anywhere in
 *     app/, components/ or lib/. Plugin content is a classic way to get script
 *     execution back after script-src has been tightened, and nothing here
 *     loses anything by refusing it.
 *   * `base-uri 'self'` — nothing sets a `<base>` tag. An injected one
 *     re-points every relative url on the page, which turns a small injection
 *     into control of where the page's own scripts come from.
 *   * `form-action 'self'` — every `<form>` in the app is an `onSubmit`
 *     handler with no `action` attribute, so none of them natively posts
 *     anywhere. This stops an injected form from posting somewhere else.
 *
 * Deliberately not here: `script-src`, `style-src`, `img-src`, `connect-src`
 * and `default-src`. Those are the ones whose correctness depends on what the
 * page actually loads at runtime, which is what the report-only policy is for.
 * A browser applies every CSP header it is sent, so this policy and the
 * report-only one coexist without either weakening the other.
 */
const ENFORCED_CSP_DIRECTIVES = ["object-src 'none'", "base-uri 'self'", "form-action 'self'"];

const ENFORCED_CSP_HEADER = {
  key: "Content-Security-Policy",
  value: ENFORCED_CSP_DIRECTIVES.join("; "),
};

/**
 * Clickjacking protection, applied everywhere except the embed routes.
 *
 * `/widgets/*` exists to be put in somebody else's page — that is the whole
 * feature — so it is the one place that must stay framable. Every other route
 * is not, and `/settings` is the reason why: a framable settings page is a
 * clickjacked settings page.
 *
 * Both headers, because `frame-ancestors` is the one browsers honour and
 * `X-Frame-Options` is what older ones understand.
 *
 * `frame-ancestors` is joined onto ENFORCED_CSP_DIRECTIVES rather than sent as
 * a second `Content-Security-Policy` header, because Next does not send two:
 * where a later rule sets a key an earlier rule already set, the later value
 * REPLACES it. Verified by hand — with the two split across the two rules,
 * `/` came back carrying only `frame-ancestors` and had silently lost
 * `object-src`, `base-uri` and `form-action`. The widget rule keeps the
 * shorter list, which is the same policy minus the one directive that would
 * stop it being embeddable.
 */
const ANTI_FRAMING_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: [...ENFORCED_CSP_DIRECTIVES, "frame-ancestors 'none'"].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    /**
     * Deliberately empty: nothing in this app is served through the image
     * optimizer, so it is given no remote host it may fetch from.
     *
     * Every `<Image>` here passes `unoptimized={isUnoptimizedSource(src)}`, and
     * `DIRECT_HOSTS` in lib/utils/image-source.ts covers every catalogue CDN
     * this app renders — TMDB, AniList, MyAnimeList, IGDB, the Steam CDNs and
     * the YouTube avatar hosts. Custom uploads are plain `<img>` on signed
     * urls. `unoptimized` short-circuits inside `generateImgAttrs` before the
     * loader that validates this list ever runs, so removing these entries
     * changes not one rendered pixel — checked host by host against
     * DIRECT_HOSTS before it was emptied.
     *
     * What it does change is the reachability of `/_next/image`, which is a
     * public endpoint whether or not the app's own components use it: an
     * entry here lets anyone ask this server to fetch and decode a remote
     * image. `**.akamaihd.net`, `**.steamstatic.com` and `**.steampowered.com`
     * were wildcards over shared CDN namespaces, so "an allowed host" was a
     * wider set than the Steam assets they were added for. With the list
     * empty the optimizer has no remote fetch to make, which is what closes
     * the AVIF decode path of GHSA-2xp9-vwfh-vxw4 rather than only patching it
     * (the Next 16.3.3 upgrade is the patch; this is the surface).
     *
     * Adding a `next/image` without `unoptimized` now fails loudly in
     * development rather than quietly reopening that endpoint — which is the
     * intended trade.
     */
    remotePatterns: [],
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

  async headers() {
    return [
      {
        // Everything, including the widget routes: none of these headers has
        // anything to do with framing.
        source: "/:path*",
        headers: [
          ...BASELINE_HEADERS,
          // Enforced on every route, widgets included — none of these three
          // directives has anything to do with framing.
          ENFORCED_CSP_HEADER,
          {
            key: "Content-Security-Policy-Report-Only",
            value: contentSecurityPolicyReportOnly(),
          },
        ],
      },
      {
        // Everything except /widgets/**. The negative lookahead is the
        // documented way to say "not this prefix" in a header source — a
        // second, broader rule would not override the first, it would be sent
        // alongside it, and two conflicting frame-ancestors is the most
        // restrictive of the two, which would break the embeds.
        source: "/((?!widgets/).*)",
        headers: ANTI_FRAMING_HEADERS,
      },
    ];
  },
};

export default nextConfig;
