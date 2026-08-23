"use client";

import { useRef, useState } from "react";
import { ImagePlus, Upload } from "lucide-react";
import type { CustomTierRow } from "@/lib/types/custom-list";
import { MAX_UPLOAD_BYTES } from "@/lib/custom-lists/uploads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trackCustomItemUploaded } from "@/lib/analytics/events";

interface UploadDialogProps {
  listId: string;
  rows: CustomTierRow[];
  onUploaded: () => void;
}

const MEGABYTES = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

/**
 * Adding a picture to a board.
 *
 * Two ways in, because they are two different intentions: emptying a camera
 * roll onto the board and sorting it later, or adding one picture that already
 * has its place. The tier defaults to the pool, so the quick path is the one
 * that needs no decisions.
 *
 * The rights checkbox is not decoration. The server refuses an upload without
 * it, so unticking it here is not a way to skip a step — it is the same
 * question asked once.
 */
export function UploadDialog({ listId, rows, onUploaded }: UploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [rowId, setRowId] = useState<string>("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setCaption("");
    setRowId("");
    setRights(false);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError("");

    const form = new FormData();
    form.set("file", file);
    form.set("listId", listId);
    form.set("caption", caption);
    form.set("rightsConfirmed", String(rights));
    if (rowId) form.set("rowId", rowId);

    try {
      const res = await fetch("/api/custom-uploads", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "The picture could not be uploaded.");
        return;
      }
      // Measured from the file that was actually accepted, not from the form:
      // the size is what the storage forecast is built on.
      trackCustomItemUploaded({
        byteSize: file.size,
        contentType: file.type,
        placedInTier: rowId !== "",
      });
      reset();
      setOpen(false);
      onUploaded();
    } catch {
      setError("The picture could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden />
        Add a picture
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-4">
            <h2 className="text-base font-semibold">Add a picture</h2>

            <label className="mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted hover:border-accent/50">
              <Upload className="h-5 w-5" aria-hidden />
              {file ? file.name : `JPEG, PNG or WebP, up to ${MEGABYTES} MB`}
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError("");
                }}
              />
            </label>

            <label className="mt-3 block text-xs font-medium text-muted">
              Caption (optional)
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={120}
                placeholder="What is this?"
                className="mt-1"
              />
            </label>

            <label className="mt-3 block text-xs font-medium text-muted">
              Tier
              <select
                value={rowId}
                onChange={(e) => setRowId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {/* The default: straight to the pool, sorted by dragging later. */}
                <option value="">Unsorted — put it below the board</option>
                {rows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={rights}
                onChange={(e) => setRights(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
              />
              <span>
                I confirm I have the right to use this image and that it does not break the
                site&rsquo;s rules.
              </span>
            </label>

            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={submit} disabled={!file || !rights || busy}>
                {busy ? "Uploading…" : "Add to board"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
