"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A small persisted string preference (e.g. display density), backed by
 * useSyncExternalStore for the same reason as useRankedTitles: reading
 * localStorage during render needs a stable SSR snapshot, and setState-in-effect
 * hydration patterns are disallowed by this repo's lint config.
 */
export function useLocalStoragePreference<T extends string>(
  key: string,
  defaultValue: T,
  isValid: (value: string) => value is T
) {
  const changedEvent = `cinetier:pref-changed:${key}`;

  const subscribe = useCallback(
    (callback: () => void) => {
      window.addEventListener("storage", callback);
      window.addEventListener(changedEvent, callback);
      return () => {
        window.removeEventListener("storage", callback);
        window.removeEventListener(changedEvent, callback);
      };
    },
    [changedEvent]
  );

  const getSnapshot = useCallback((): T => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw && isValid(raw) ? raw : defaultValue;
    } catch {
      return defaultValue;
    }
  }, [key, defaultValue, isValid]);

  const getServerSnapshot = useCallback((): T => defaultValue, [defaultValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, next);
        window.dispatchEvent(new Event(changedEvent));
      } catch {
        // localStorage unavailable (e.g. private browsing) — preference just won't persist.
      }
    },
    [key, changedEvent]
  );

  return [value, setValue] as const;
}
