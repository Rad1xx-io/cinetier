import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Shared machinery for the smoke suite: real requests to real catalogues.
 *
 * These exist because 649 unit tests run entirely against mocks and therefore
 * cannot see an upstream change its own behaviour. Both anime outages this year
 * were reported by a user before any test noticed, and so was AniList becoming
 * case-sensitive about Cyrillic synonyms.
 */

/**
 * Vitest does not read .env.local the way Next does, so a local run would have
 * no keys and skip almost everything. Parsed once, and never overriding a
 * variable the environment already set — CI passes secrets that way.
 */
function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (value && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // No .env.local is normal in CI, where the secrets arrive as real env vars.
  }
}

loadEnvLocal();

/** How long one attempt may take. Catalogues are slow, and a cold one is slower. */
export const ATTEMPT_TIMEOUT_MS = 15_000;

/** Vitest's per-test budget has to cover every retry plus the pauses between. */
export const TEST_TIMEOUT_MS = 60_000;

const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class SmokeFailure extends Error {
  constructor(label: string, attempts: number, lastError: string) {
    super(
      `${label} did not answer after ${attempts} attempts. Last failure: ${lastError}. ` +
        `This is a real upstream problem, not a flaky assertion — check the catalogue's status before changing code.`
    );
    this.name = "SmokeFailure";
  }
}

/**
 * Runs a request, retrying what a retry can fix.
 *
 * Catalogues flap: a 504 from Jikan or a momentary 502 from AniList says
 * nothing about whether the integration works. Three attempts with a growing
 * pause tells them apart from an outage, and the message that survives says
 * which it was.
 */
export async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  let last = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await run();
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new SmokeFailure(label, MAX_ATTEMPTS, last);
}

/** A fetch that fails loudly on a non-2xx, so `withRetry` can see it. */
export async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  }
  return (await response.json()) as T;
}

/**
 * AniList refuses a request with no User-Agent, which cost an afternoon to
 * find. Every caller here sends one.
 */
export const USER_AGENT =
  "TierListOnline-smoke/1.0 (+https://tierlistonline.com; automated availability check)";

/**
 * True when a catalogue's credentials are present. A contributor without keys
 * should see the affected suites skip, not fail — the point is to catch a
 * catalogue changing, not to demand everyone hold every secret.
 */
export function hasEnv(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}
