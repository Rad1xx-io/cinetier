"use client";

import { useSyncExternalStore } from "react";
import { CloudAlert } from "lucide-react";
import {
  getServerSyncStatus,
  getSyncStatus,
  retrySync,
  subscribeToSyncStatus,
} from "@/lib/storage/sync-status";

/**
 * Says so when the rankings on screen could not be checked against the account.
 *
 * Only failure is worth a banner: a sync that works is invisible by design, and
 * a spinner on every page load would be noise. What is not acceptable is the
 * silent version — someone signing in on a new phone, seeing an empty board and
 * concluding their tier list is gone, when the truth is one failed request.
 */
export function SyncStatusBanner() {
  const status = useSyncExternalStore(subscribeToSyncStatus, getSyncStatus, getServerSyncStatus);
  if (status.state !== "failed") return null;

  return (
    <div
      role="alert"
      className="fixed bottom-24 left-1/2 z-50 flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-xl border border-tier-s/30 bg-surface-raised px-4 py-3 text-sm shadow-xl backdrop-blur md:bottom-8"
    >
      <CloudAlert className="mt-0.5 h-4 w-4 shrink-0 text-tier-s" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Could not load your saved rankings</p>
        <p className="mt-0.5 text-xs text-muted">
          Nothing has been changed or lost — this device just could not reach your account. Anything
          you rank now stays on this device until it can.
        </p>
      </div>
      <button
        onClick={retrySync}
        className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Try again
      </button>
    </div>
  );
}
