import "server-only";

export class AppStoreError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AppStoreError";
    this.status = status;
  }
}

/**
 * No API key: iTunes Search (`itunes.apple.com/search`) is Apple's public,
 * documented-but-archived endpoint. Its own docs name a limit around 20
 * requests a MINUTE — small next to TMDB/IGDB/AniList's quotas, and unlike
 * theirs it reads as a budget for this whole server's outbound IP, not one
 * per visitor (see .ai/PLAN-nav-and-mobile-games.md, B.3, and the
 * "mobile-games" tier in lib/rate-limit/limiter.ts, which only guards
 * against one visitor spending it, not the ceiling itself).
 *
 * MIN_INTERVAL_MS is the actual defense against that shared ceiling: no two
 * outbound calls from this module fire closer together than this, whatever
 * asked for them and however many visitors are searching at once. Held well
 * under the documented limit (12/min, not 20) because that number was never
 * a guaranteed contract to begin with.
 *
 * Honest limit of this approach: `lastCallAt` lives in this module's own
 * memory, which Vercel gives one copy of per warm serverless instance, not
 * one for the whole deployment. Under real concurrent traffic across
 * multiple instances this is a per-instance throttle, not a hard global one
 * — the same limitation this project already accepts for an in-memory
 * counter elsewhere (see lib/rate-limit/limiter.ts's own header on why its
 * counter lives in Postgres instead). A Postgres-backed version of this gate
 * would close that gap; not built here because nothing so far has shown the
 * simple version insufficient, and a scarce, undocumented-contract budget is
 * exactly the kind of thing not worth over-engineering ahead of evidence.
 */
const MIN_INTERVAL_MS = 5_000;
let lastCallAt = 0;
let queue: Promise<void> = Promise.resolve();

function paced<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
  });
  queue = result.catch(() => {});
  return result.then(run);
}

/** Server-only fetch helper for iTunes Search, paced against the shared budget above. */
export async function appStoreFetch<T>(url: string, revalidateSeconds = 900): Promise<T> {
  return paced(async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        next: { revalidate: revalidateSeconds },
      });
    } catch {
      throw new AppStoreError("Could not reach the App Store.", 502);
    }

    if (response.status === 429 || response.status === 403) {
      throw new AppStoreError("App Store rate limit exceeded. Please try again shortly.", 429);
    }
    if (!response.ok) {
      throw new AppStoreError(`App Store request failed (${response.status}).`, response.status);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new AppStoreError("App Store returned a malformed response.", 502);
    }
  });
}
