"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportPreviewTable, type PreviewEntry } from "@/components/import/import-preview-table";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import {
  readLetterboxdRatingsFile,
  parseLetterboxdRatings,
  LetterboxdImportError,
} from "@/lib/import/letterboxd";
import { matchAgainstTmdb } from "@/lib/import/match";
import { buildImportPlan, buildPreviewRows } from "@/lib/import/merge";
import { LETTERBOXD_TIER_MAP } from "@/lib/import/tier-mapping";
import {
  trackFirstTitleRanked,
  trackImportCompleted,
  trackImportStarted,
  trackListCreationStarted,
} from "@/lib/analytics/events";
import { titlesCountLabel } from "@/lib/utils/plural";
import type { Tier } from "@/lib/types";

const SOURCE = "letterboxd";

type Phase =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "matching"; done: number; total: number }
  | { kind: "preview"; entries: PreviewEntry[] }
  | { kind: "writing" }
  | { kind: "done"; added: number; skippedDuplicates: number; unmatched: number }
  | { kind: "error"; message: string };

/**
 * Bringing someone's Letterboxd ratings into their own tier list.
 *
 * Everything here works signed out too — Custom boards need an account
 * because every write goes straight to Supabase, but a ranked title is
 * local-first the same way typing one in by hand already is, and an import
 * is not a different enough action to suddenly require signing in for it.
 */
export function LetterboxdImportPanel() {
  const router = useRouter();
  const { titles, reorderAll } = useRankedTitles();
  const { user } = useSupabaseSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [confirmed, setConfirmed] = useState(false);

  function reset() {
    setPhase({ kind: "idle" });
    setConfirmed(false);
  }

  async function handleFile(file: File) {
    setPhase({ kind: "reading" });
    setConfirmed(false);

    let rows;
    try {
      const csvText = await readLetterboxdRatingsFile(file);
      rows = parseLetterboxdRatings(csvText);
    } catch (error) {
      setPhase({
        kind: "error",
        message:
          error instanceof LetterboxdImportError
            ? error.message
            : "Could not read that file. Make sure it's the export from Settings → Data → Export on Letterboxd.",
      });
      return;
    }

    if (rows.length === 0) {
      setPhase({ kind: "error", message: "No rated films were found in that file." });
      return;
    }

    trackImportStarted(SOURCE, rows.length);

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "matching", done: 0, total: rows.length });

    const matches = await matchAgainstTmdb(rows, {
      authenticated: user !== null,
      signal: controller.signal,
      onProgress: (done, total) => setPhase({ kind: "matching", done, total }),
    });

    const preview = buildPreviewRows(matches, titles, LETTERBOXD_TIER_MAP);
    const entries: PreviewEntry[] = preview.map((row) => ({
      row,
      // Reviewed before anything is written, the same reasoning the publish
      // dialogs' content-rules checkbox settled on: a confident match starts
      // checked so a big, mostly-correct import is not a thousand clicks,
      // and an uncertain one starts unchecked so a wrong guess is not
      // written just because nobody unchecked it — see the module doc.
      included: row.match !== null && !row.alreadyRanked && row.confidence !== "uncertain",
    }));
    setPhase({ kind: "preview", entries });
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleFile(file);
  }

  function toggleRow(index: number) {
    if (phase.kind !== "preview") return;
    const entries = phase.entries.map((entry, i) =>
      i === index ? { ...entry, included: !entry.included } : entry
    );
    setPhase({ kind: "preview", entries });
  }

  function changeTier(index: number, tier: Tier) {
    if (phase.kind !== "preview") return;
    const entries = phase.entries.map((entry, i) =>
      i === index ? { ...entry, row: { ...entry.row, tier } } : entry
    );
    setPhase({ kind: "preview", entries });
  }

  async function handleConfirm() {
    if (phase.kind !== "preview" || !confirmed) return;

    const confirmedRows = phase.entries.filter((e) => e.included).map((e) => e.row);
    setPhase({ kind: "writing" });

    const plan = buildImportPlan(confirmedRows, titles);
    const unmatched = phase.entries.filter((e) => e.row.match === null).length;

    // Read before the write, and fired only once — the exact rule
    // addTitle()/useRankedTitles's add() already apply per title, applied
    // here once for the whole batch instead of once per row. See
    // .ai/DECISIONS.md for why a thousand-row loop would have gotten this
    // wrong (or simply never fired it, had the write skipped addTitle()
    // entirely, which it does, for the O(n²) reason recorded there too).
    if (plan.added > 0) {
      if (plan.isFirstTitleEver) trackFirstTitleRanked();
      if (plan.startsMovieCatalog) trackListCreationStarted("movie");
    }

    reorderAll(plan.items);
    trackImportCompleted(SOURCE, plan.added, plan.skippedDuplicates, unmatched);
    setPhase({ kind: "done", added: plan.added, skippedDuplicates: plan.skippedDuplicates, unmatched });
  }

  function handleCancelMatching() {
    abortRef.current?.abort();
    reset();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Import from Letterboxd</h2>
      <p className="mt-1 text-sm text-muted">
        Bring your star ratings in as a tier list. From Letterboxd:{" "}
        <span className="text-foreground">Settings → Data → Export</span> — hand over the zip it
        gives you, or just <code className="text-xs">ratings.csv</code> out of it.
      </p>

      {phase.kind === "idle" && (
        <div className="mt-4">
          <Button onClick={() => fileInputRef.current?.click()} variant="secondary">
            <Upload className="h-4 w-4" aria-hidden />
            Choose file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.csv,application/zip,text/csv"
            className="hidden"
            onChange={handleFileSelected}
            aria-hidden
          />
        </div>
      )}

      {phase.kind === "reading" && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Reading the file…
        </p>
      )}

      {phase.kind === "matching" && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Matching against TMDB — {phase.done} / {phase.total}
          </p>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={phase.total}
            aria-valuenow={phase.done}
            aria-label="Matching progress"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${(phase.done / phase.total) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            A big export takes a few minutes — TMDB is asked one title at a time, on purpose.
          </p>
          <Button onClick={handleCancelMatching} variant="ghost" size="sm" className="mt-2">
            Cancel
          </Button>
        </div>
      )}

      {phase.kind === "preview" && (
        <div className="mt-4">
          <p className="text-sm text-muted">
            {titlesCountLabel(phase.entries.filter((e) => e.included).length)} ready to import,
            out of {titlesCountLabel(phase.entries.length)} found in the file. Nothing is written
            until you confirm below.
          </p>

          <div className="mt-3 max-h-[28rem] overflow-y-auto">
            <ImportPreviewTable entries={phase.entries} onToggle={toggleRow} onChangeTier={changeTier} />
          </div>

          <label className="mt-4 flex items-start gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
            />
            <span>
              I&rsquo;ve checked the matches above and I&rsquo;m ready to add the checked titles
              to my tier list.
            </span>
          </label>

          <div className="mt-3 flex gap-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void handleConfirm()}
              disabled={!confirmed || phase.entries.every((e) => !e.included)}
            >
              Import
            </Button>
          </div>
        </div>
      )}

      {phase.kind === "writing" && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Adding to your tier list…
        </p>
      )}

      {phase.kind === "done" && (
        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-2 text-sm text-accent">
            <Check className="h-4 w-4 shrink-0" aria-hidden />
            Added {titlesCountLabel(phase.added)}.
            {phase.skippedDuplicates > 0 &&
              ` ${titlesCountLabel(phase.skippedDuplicates)} were already in your list and kept as they were.`}
            {phase.unmatched > 0 && ` ${titlesCountLabel(phase.unmatched)} couldn't be matched on TMDB.`}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => router.push("/tier-list")}>
              View your tier list
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              Import another file
            </Button>
          </div>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="mt-4">
          <p className="flex items-start gap-1.5 text-xs text-tier-s">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {phase.message}
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={reset}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
