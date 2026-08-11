import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TopNav } from "@/components/navigation/top-nav";
import { BottomNav } from "@/components/navigation/bottom-nav";
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
        <TopNav />
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <footer className="hidden border-t border-border px-6 py-6 text-center text-xs text-muted md:block">
          Этот продукт использует TMDB API, но не одобрен и не сертифицирован TMDB.
        </footer>
        <BottomNav />
      </body>
    </html>
  );
}
