"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastState {
  message: string;
  /** Bumped on every call so repeating the same message still re-triggers the animation. */
  id: number;
}

/**
 * Minimal transient message, deliberately not a global provider: only two
 * buttons in the app need one, and a local hook keeps the toast tied to the
 * component that raised it.
 */
export function useToast(durationMs = 2500) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const show = useCallback(
    (message: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setToast({ message, id: ++nextId.current });
      timeoutRef.current = setTimeout(() => setToast(null), durationMs);
    },
    [durationMs]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { toast, show };
}
