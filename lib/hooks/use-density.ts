"use client";

import { useLocalStoragePreference } from "@/lib/hooks/use-local-storage-preference";

export type Density = "comfortable" | "compact";

export const DENSITY_STORAGE_KEY = "cinetier:density";

export function isDensity(value: string): value is Density {
  return value === "comfortable" || value === "compact";
}

export function useDensity() {
  const [density, setDensity] = useLocalStoragePreference<Density>(
    DENSITY_STORAGE_KEY,
    "comfortable",
    isDensity
  );
  return { density, setDensity };
}
