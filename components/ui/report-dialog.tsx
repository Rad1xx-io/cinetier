"use client";

import { useState } from "react";
import type { ReportSubjectType } from "@/lib/types/custom-list";
import { Button } from "@/components/ui/button";

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  subjectType: ReportSubjectType;
  subjectId: string;
  label: string;
}

/**
 * The form behind every "Report" action, wherever it is triggered from.
 *
 * Controlled rather than owning its own open state: `ReportButton` wraps this
 * for the overlay-icon case (a custom card, a comment), but a post's report
 * lives behind its overflow menu, which only ever calls back with "selected" —
 * something has to hold whether the form is open, and that has to be the
 * caller, not this component.
 */
export function ReportDialog({ open, onClose, subjectType, subjectId, label }: ReportDialogProps) {
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [message, setMessage] = useState("");

  if (!open) return null;

  async function submit() {
    setState("sending");
    try {
      const res = await fetch("/api/custom-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectType, subjectId, reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "The report could not be sent.");
        setState("failed");
        return;
      }
      setState("sent");
    } catch {
      setMessage("The report could not be sent.");
      setState("failed");
    }
  }

  function handleClose() {
    onClose();
    // Reset for the next time this subject is reported — a dialog reopened on
    // the same comment should not still say "Reported" from last time.
    setReason("");
    setState("idle");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold">{label}</h2>

        {state === "sent" ? (
          <>
            <p className="mt-2 text-sm text-muted">Reported. Thank you — somebody will look at it.</p>
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={handleClose}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">
              Say briefly what is wrong with it. Reports are read by a person.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              className="mt-3 w-full rounded-lg border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              placeholder="What is wrong with this?"
            />
            {state === "failed" && <p className="mt-2 text-xs text-red-400">{message}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={submit}
                disabled={reason.trim().length < 3 || state === "sending"}
              >
                {state === "sending" ? "Sending…" : "Send report"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
