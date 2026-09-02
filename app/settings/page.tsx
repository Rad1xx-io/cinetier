import Link from "next/link";
import { Import } from "lucide-react";
import { ImportExportPanel } from "@/components/settings/import-export-panel";
import { AccountPanel } from "@/components/auth/account-panel";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Settings — TierListOnline",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your TierListOnline data — where it lives, and how to keep a copy.
        </p>
      </div>

      <AccountPanel />

      {/*
       * A different kind of import from the panel below: that one restores a
       * TierListOnline backup, a trusted round-trip with nothing to review.
       * This one brings in somebody else's rating scale from outside the
       * app entirely, which is why it gets its own page rather than another
       * button here — matching titles against TMDB and previewing what was
       * found needs room a Settings panel does not have. Letterboxd is the
       * only source today; a second one would add a second link beside this
       * rather than replacing it.
       */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Import ratings from elsewhere</h2>
        <p className="mt-1 text-sm text-muted">
          Bring ratings in from another site — matched against TMDB, previewed before anything is
          added to your tier list.
        </p>
        <Button asChild variant="secondary" className="mt-3">
          <Link href="/import/letterboxd">
            <Import className="h-4 w-4" aria-hidden />
            Import from Letterboxd
          </Link>
        </Button>
      </div>

      <div id="export">
        <ImportExportPanel />
      </div>

      <p className="border-t border-border pt-6 text-xs leading-relaxed text-muted">
          This product uses the TMDB API but is not endorsed or certified by TMDB. All film
          and TV data is provided by{" "}
        <a
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          The Movie Database (TMDB)
        </a>
        .
      </p>
    </div>
  );
}
