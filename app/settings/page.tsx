import { ImportExportPanel } from "@/components/settings/import-export-panel";
import { AccountPanel } from "@/components/auth/account-panel";

export const metadata = {
  title: "Настройки — TierListOnline",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>
        <p className="mt-1 text-sm text-muted">Управление вашими локальными данными TierListOnline.</p>
      </div>

      <AccountPanel />

      <div id="export">
        <ImportExportPanel />
      </div>

      <p className="border-t border-border pt-6 text-xs leading-relaxed text-muted">
        Этот продукт использует TMDB API, но не одобрен и не сертифицирован TMDB. Все данные о
        фильмах и сериалах предоставлены{" "}
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
