"use client";

import { Check } from "lucide-react";
import type { ToastState } from "@/lib/hooks/use-toast";

/** Fixed above the mobile tab bar so it never covers the navigation. */
export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;

  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className="animate-fade-in fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface-raised px-4 py-2.5 text-sm shadow-xl backdrop-blur md:bottom-8"
    >
      <Check className="h-4 w-4 text-accent" aria-hidden />
      {toast.message}
    </div>
  );
}
