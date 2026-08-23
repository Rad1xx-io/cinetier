"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import type { ReportSubjectType } from "@/lib/types/custom-list";
import { Button } from "@/components/ui/button";

interface ReportButtonProps {
  subjectType: ReportSubjectType;
  subjectId: string;
  label: string;
}

/**
 * The way somebody says a picture should not be here.
 *
 * Nothing on this site inspects an upload automatically, so this is the only
 * signal that exists. It asks for a sentence rather than offering a menu of
 * categories: a menu would need a taxonomy nobody has agreed on yet, and the
 * person who has to act on this will read the sentence either way.
 */
export function ReportButton({ subjectType, subjectId, label }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [message, setMessage] = useState("");

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

  if (state === "sent") {
    return <p className="text-xs text-muted">Reported. Thank you — somebody will look at it.</p>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-background/80 p-1 text-muted backdrop-blur hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={label}
        title={label}
      >
        <Flag className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-4">
            <h2 className="text-sm font-semibold">{label}</h2>
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
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
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
          </div>
        </div>
      )}
    </>
  );
}
