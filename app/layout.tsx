import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TopNav } from "@/components/navigation/top-nav";
import { MobileHeader } from "@/components/navigation/mobile-header";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { Analytics } from "@vercel/analytics/next";
import { CloudSyncProvider } from "@/components/auth/cloud-sync-provider";
import { ChromeGate } from "@/components/layout/chrome-gate";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { GOOGLE_SITE_VERIFICATION, SITE_URL } from "@/lib/seo/site";
import { defaultOgImage } from "@/lib/seo/og-image";
import { PostHogProvider } from "@/app/providers/PostHogProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Resolves every relative URL the app hands to Next — canonicals, Open Graph
  // images, the sitemap link. Without it those stay relative and are dropped by
  // the crawlers that need them most.
  metadataBase: new URL(SITE_URL),
  // "./" resolves against metadataBase *and the current route*, so every page
  // gets its own canonical on the real domain. A literal "/" here would claim
  // every page is the home page, which is worse than no canonical at all.
  alternates: { canonical: "./" },
  title: "TierListOnline — rank what you watch and play",
  description: "Build tier lists for films, TV, anime, games and YouTube channels, then share them.",
  // Spelled out rather than left to Next's defaults: without an explicit block
  // there is no og:type, no og:locale and no site name, so a shared link shows
  // a bare URL. Page-level metadata overrides what it needs.
  openGraph: {
    type: "website",
    siteName: "TierListOnline",
    locale: "en_US",
    title: "TierListOnline — rank what you watch and play",
    description:
      "Build tier lists for films, TV, anime, games and YouTube channels, then share them.",
    // Relative for the same reason as the canonical above: a fixed origin here
    // would tell every share sheet that /feed and /u/<name> are the home page.
    url: "./",
    // The floor for every page that has nothing more specific to show. A
    // summary_large_image card with no image does not render large — it
    // collapses to a plain link, which is what /feed and the home page were
    // doing until now.
    images: [defaultOgImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "TierListOnline — rank what you watch and play",
    description:
      "Build tier lists for films, TV, anime, games and YouTube channels, then share them.",
    images: [defaultOgImage],
  },
  // Emitted only once a token exists: a tag with an empty content attribute
  // looks configured while verifying nothing.
  ...(GOOGLE_SITE_VERIFICATION
    ? { verification: { google: GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <CloudSyncProvider />
        <PostHogProvider />
        <PageViewTracker />
        <ChromeGate>
          <TopNav />
          <MobileHeader />
        </ChromeGate>
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <ChromeGate>
          <footer className="hidden border-t border-border px-6 py-6 text-center text-xs text-muted md:block">
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </footer>
          <BottomNav />
        </ChromeGate>
        {/* Vercel Web Analytics. Inert outside a Vercel deployment, so local
            runs and other hosts are unaffected. */}
        <Analytics />
      </body>
    </html>
  );
}
