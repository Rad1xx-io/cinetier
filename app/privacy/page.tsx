import type { Metadata } from "next";

const DESCRIPTION = "What TierListOnline stores, why, and how to have it removed.";

export const metadata: Metadata = {
  title: "Privacy — TierListOnline",
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Privacy — TierListOnline", description: DESCRIPTION, url: "/privacy" },
  twitter: { title: "Privacy — TierListOnline", description: DESCRIPTION },
};

/** Kept in one place so the "last reviewed" line and the file agree. */
const LAST_UPDATED = "27 August 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Privacy</h1>
        <p className="mt-1 text-xs text-muted">Last updated {LAST_UPDATED}.</p>
      </div>

      <div className="space-y-8 text-sm leading-relaxed text-muted sm:text-base">
        <p>
          This describes what TierListOnline actually does with your data, specific to how the
          site is built rather than a generic template. If a section does not apply to how you use
          the site — you never signed in, say — it simply does not apply to you.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Accounts</h2>
          <p>
            Signing in goes through Supabase Auth, by Google sign-in or a passwordless email
            link — there are no passwords stored on this site either way. That gives us your email
            address and an account id; Google sign-in also shares whatever basic profile Google
            hands over (typically a name and avatar). Choosing a public username and display name
            in Settings is optional and is what makes a board of yours found and shareable by
            other people.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Your tier lists and boards</h2>
          <p>
            Rankings you build live in your browser first (local storage), and are mirrored to a
            Supabase database once you are signed in, so they follow you between devices. A board
            you mark public is readable by anyone with the link; a board left private is not. A
            board you publish to the feed keeps its shape — which item sat in which tier — as it
            stood the moment you published, so editing the board afterwards does not silently
            rewrite a post you already shared.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Photos you upload</h2>
          <p>
            Custom boards let you upload your own pictures — up to 2&nbsp;MB, JPEG, PNG or WebP —
            stored in Supabase Storage under your account. Uploading asks you to confirm you have
            the right to use the image; that checkbox is enforced on the server, not only shown on
            screen. You can hide or delete your own pictures and boards at any time. Anyone can
            report a photo or a post they find on the site; a report is reviewed by hand rather
            than by an automated filter — nothing here is scanned for content automatically today.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Analytics</h2>
          <p>
            The site uses PostHog to see which pages get used and whether things like publishing
            or ranking work in practice — page views and product events (ranking an item,
            publishing a board, and similar), tied to your account id once you are signed in but
            never to your email. PostHog also records a masked view of how the site is used: every
            input on the page — including a magic-link email field — is blanked out before
            anything is recorded, so nothing you type is ever captured this way. There are no
            advertising networks and no ad-tracking pixels on this site, and no cookie-consent
            banner is currently shown; analytics runs by default the way most of this site does.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">
            Catalogue data — films, anime, games, YouTube
          </h2>
          <p>
            Titles, posters, descriptions and similar details come from TMDB, IGDB and the YouTube
            Data API. Browsing the catalogue sends a request to those services on your behalf; no
            account information is included in it. TierListOnline is not endorsed or certified by
            any of them.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">
            &ldquo;Where to watch&rdquo; and donation links
          </h2>
          <p>
            Streaming links on a title&rsquo;s page are affiliate links to third-party services;
            clicking one takes you to that service&rsquo;s own site, and any payment happens
            entirely there — this site never sees or handles payment details. The same is true of
            an author&rsquo;s donate button, which links out to wherever they collect support
            (Boosty, CloudTips, Patreon and the like); TierListOnline does not process or see that
            money either.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Deleting your data</h2>
          <p>
            You can remove a board, a photo or a post yourself at any time from the site. To close
            your account entirely, or ask what is held about a specific address, email{" "}
            <a href="mailto:kseronikseu@gmail.com" className="text-accent hover:underline">
              kseronikseu@gmail.com
            </a>
            .
          </p>
        </section>

        <p className="text-xs">
          This is a plain description of what the site does, not a substitute for legal advice.
          It may be updated as the site changes; the date above says when it last was.
        </p>
      </div>
    </div>
  );
}
