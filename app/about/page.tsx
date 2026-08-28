import type { Metadata } from "next";
import Link from "next/link";

const DESCRIPTION =
  "What TierListOnline is, and who is behind it — an independent project, not a company.";

export const metadata: Metadata = {
  title: "About — TierListOnline",
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: { title: "About — TierListOnline", description: DESCRIPTION, url: "/about" },
  twitter: { title: "About — TierListOnline", description: DESCRIPTION },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">About</h1>

      <div className="space-y-4 text-sm leading-relaxed text-muted sm:text-base">
        <p>
          TierListOnline is a place to rank the films, TV, anime, games and YouTube channels you
          have actually watched or played, then share the result — or fork somebody else&rsquo;s
          board and rank it your own way. Your list is one list across everything you rank; a
          filter just changes what you are looking at, not what exists.
        </p>
        <p>
          It is an independent, solo-built project — not a company, and not affiliated with TMDB,
          IGDB, YouTube or any of the services it pulls catalogue data from. It stays free to use
          because a few affiliate and donation links pay for hosting, not because there is a
          product being sold behind it.
        </p>
        <p>
          If something is broken, or you want to report a photo or a post, see{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy
          </Link>{" "}
          for how to get in touch.
        </p>
      </div>
    </div>
  );
}
