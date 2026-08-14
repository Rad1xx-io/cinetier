import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TopNav } from "@/components/navigation/top-nav";
import { MobileHeader } from "@/components/navigation/mobile-header";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { Analytics } from "@vercel/analytics/next";
import { CloudSyncProvider } from "@/components/auth/cloud-sync-provider";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
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
  title: "CineTier — мои рейтинги фильмов и сериалов",
  description: "Личный тир-лист для фильмов и сериалов.",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <CloudSyncProvider />
        <PageViewTracker />
        <TopNav />
        <MobileHeader />
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <footer className="hidden border-t border-border px-6 py-6 text-center text-xs text-muted md:block">
          Этот продукт использует TMDB API, но не одобрен и не сертифицирован TMDB.
        </footer>
        <BottomNav />
        {/* Vercel Web Analytics. Inert outside a Vercel deployment, so local
            runs and other hosts are unaffected. */}
        <Analytics />
      </body>
    </html>
  );
}
