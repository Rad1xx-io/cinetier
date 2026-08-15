"use client";

import { useRef, useState } from "react";
import { Check, Download, TriangleAlert, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useDensity, isDensity } from "@/lib/hooks/use-density";
import { titlesCountLabel } from "@/lib/utils/plural";

type Notice = { kind: "success" | "error"; message: string } | null;

function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ImportExportPanel() {
  const { titles, exportRatings, importRatings, clearAll } = useRankedTitles();
  const { density, setDensity } = useDensity();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  function handleExport() {
    // Bundle the display-density preference alongside the rankings so a full
    // backup restores the whole experience, not just the data. Older
    // (density-less) exports still import fine — see handleFileSelected.
    const bundle = { ...JSON.parse(exportRatings()), displayDensity: density };
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`tierlistonline-export-${date}.json`, JSON.stringify(bundle, null, 2));
    setNotice({ kind: "success", message: "Your rankings have been exported." });
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const result = importRatings(text);

      try {
        const parsed = JSON.parse(text) as { displayDensity?: unknown };
        if (typeof parsed.displayDensity === "string" && isDensity(parsed.displayDensity)) {
          setDensity(parsed.displayDensity);
        }
      } catch {
        // Density is a nice-to-have from the bundle; ignore if the extra field is malformed.
      }

      setNotice({
        kind: "success",
        message: `Imported ${titlesCountLabel(result.imported)}.`,
      });
    } catch {
      setNotice({
        kind: "error",
        message: "That file does not look like a TierListOnline export. Nothing was changed.",
      });
    }
  }

  function handleClearAll() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    clearAll();
    setConfirmingClear(false);
    setNotice({ kind: "success", message: "Your rankings have been cleared." });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Backups</h2>
        <p className="mt-1 text-sm text-muted">
          {titlesCountLabel(titles.length)} stored only in this browser’s local storage. Export the
          list from time to time so you have a copy.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={handleExport} variant="secondary">
            <Download className="h-4 w-4" aria-hidden />
            Export rankings
          </Button>
          <Button onClick={handleImportClick} variant="secondary">
            <Upload className="h-4 w-4" aria-hidden />
            Import rankings
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleFileSelected}
            aria-hidden
          />
        </div>
      </div>

      <div className="rounded-xl border border-tier-s/30 bg-tier-s/5 p-4">
        <h2 className="font-semibold text-tier-s">Danger zone</h2>
        <p className="mt-1 text-sm text-muted">
          Delete every title from your tier list. There is no undo unless you exported a backup
          first.
        </p>
        <Button
          onClick={handleClearAll}
          variant="destructive"
          size="sm"
          className="mt-3"
          onBlur={() => setConfirmingClear(false)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {confirmingClear ? "Press again to confirm" : "Clear all rankings"}
        </Button>
      </div>

      {notice && (
        <div
          role="status"
          className={
            notice.kind === "success"
              ? "flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent"
              : "flex items-center gap-2 rounded-lg border border-tier-s/30 bg-tier-s/10 px-4 py-3 text-sm text-tier-s"
          }
        >
          {notice.kind === "success" ? (
            <Check className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          )}
          {notice.message}
        </div>
      )}
    </div>
  );
}
