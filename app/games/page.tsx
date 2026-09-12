import type { Metadata } from "next";
import Link from "next/link";
import { Gamepad2, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CONTENT_TYPE_ACCENTS } from "@/lib/utils/content-type";

const DESCRIPTION = "PC or mobile — pick a catalog to browse and rank the games you have played.";

export const metadata: Metadata = {
  title: "Games — TierListOnline",
  description: DESCRIPTION,
  alternates: { canonical: "/games" },
  openGraph: { title: "Games — TierListOnline", description: DESCRIPTION, url: "/games" },
  twitter: { title: "Games — TierListOnline", description: DESCRIPTION },
};

const TILES = [
  {
    href: "/games/pc",
    label: "PC",
    description: "Steam and the wider PC catalog.",
    icon: Gamepad2,
    accent: CONTENT_TYPE_ACCENTS.game,
  },
  {
    href: "/games/mobile",
    label: "Mobile",
    description: "iPhone and iPad games from the App Store.",
    icon: Smartphone,
    accent: CONTENT_TYPE_ACCENTS.game,
  },
];

/**
 * A hub, not a list — see .ai/PLAN-nav-and-mobile-games.md (B.1). PC and
 * mobile games are different products someone may rank side by side, not
 * one catalog standing in for the other, so this page asks which one rather
 * than picking for the visitor. The desktop header answers the same
 * question through a menu on the "Games" tab itself; this page exists for
 * the one surface that has nowhere to anchor a menu — the mobile tab bar
 * links straight here instead.
 */
export default function GamesHubPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-4 py-16 text-center md:py-24">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Games</h1>
        <p className="mt-2 text-sm text-muted">{DESCRIPTION}</p>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {TILES.map(({ href, label, description, icon: Icon, accent }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-10 transition-colors",
              accent.hoverBorder,
              accent.hoverBg
            )}
          >
            <Icon className={cn("h-10 w-10 transition-colors", accent.text)} aria-hidden />
            <span className="text-lg font-semibold">{label}</span>
            <span className="text-sm text-muted">{description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
