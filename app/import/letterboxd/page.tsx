import type { Metadata } from "next";
import { LetterboxdImportPanel } from "@/components/import/letterboxd-import-panel";

export const metadata: Metadata = {
  title: "Import from Letterboxd — TierListOnline",
  robots: { index: false, follow: false },
};

export default function ImportLetterboxdPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import from Letterboxd</h1>
        <p className="mt-1 text-sm text-muted">
          Bring your Letterboxd ratings into your tier list — matched against TMDB, previewed
          before anything is added.
        </p>
      </div>

      <LetterboxdImportPanel />
    </div>
  );
}
