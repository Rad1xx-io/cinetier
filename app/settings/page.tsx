import { ImportExportPanel } from "@/components/settings/import-export-panel";
import { AccountPanel } from "@/components/auth/account-panel";

export const metadata = {
  title: "Settings — TierListOnline",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage the TierListOnline data stored on this device.</p>
      </div>

      <AccountPanel />

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
