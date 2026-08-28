import type { Metadata } from "next";

const DESCRIPTION = "The short version of what you can post here and what we can do about it.";

export const metadata: Metadata = {
  title: "Terms — TierListOnline",
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: { title: "Terms — TierListOnline", description: DESCRIPTION, url: "/terms" },
  twitter: { title: "Terms — TierListOnline", description: DESCRIPTION },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Terms</h1>

      <div className="space-y-4 text-sm leading-relaxed text-muted sm:text-base">
        <p>
          TierListOnline is a small, independent, solo-built project. These terms are kept short
          on purpose — using the site means agreeing to them.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Your content</h2>
          <p>
            Tier lists, custom boards, uploaded photos, posts, comments and forks stay yours. By
            posting or publishing something you give TierListOnline permission to display, store
            and serve it back — to you and, for anything you mark public, to other visitors —
            which is what running the site requires. You are responsible for what you upload,
            including having the right to use any photo you add to a custom board.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Acceptable use</h2>
          <p>
            Don&rsquo;t upload content you don&rsquo;t have the rights to, don&rsquo;t upload
            anything illegal, and don&rsquo;t use the site to harass anyone. Play fair with forks —
            forking a public board to rank it your own way is the point; passing off someone
            else&rsquo;s work as your own is not.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Removing content</h2>
          <p>
            You can delete or hide your own boards, photos, posts and comments at any time.
            Anyone can report content that breaks these terms; a report is reviewed by hand, and
            content that violates them can be removed or an account restricted without notice.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">No warranty</h2>
          <p>
            The site is provided as-is, run by one person in their spare time. There is no
            guarantee it will always be available, bug-free, or that catalogue data pulled from
            TMDB, IGDB or YouTube is accurate — it comes from them, not from us. Use it at your own
            risk.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Changes</h2>
          <p>
            These terms may change as the site does. Continuing to use TierListOnline after a
            change means you accept the update. Questions go to the same address listed on{" "}
            <a href="/privacy" className="text-accent hover:underline">
              Privacy
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
