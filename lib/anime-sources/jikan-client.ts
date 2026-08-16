import "server-only";
import { AnimeSourceError } from "@/lib/anime-sources/anime-source";

const JIKAN_BASE = "https://api.jikan.moe/v4";

/**
 * Jikan allows 3 requests per second. Requests are therefore serialised behind
 * a single promise chain with a minimum gap, rather than fired in parallel and
 * apologised for afterwards: the search fallback can issue three lookups for
 * one user query, which is exactly the burst the limit is there to stop.
 */
export const jikanTiming = {
  minIntervalMs: 400,
  /** 1s, then 2s. Jikan's own guidance is to back off rather than hammer. */
  backoffMs: (attempt: number) => 1000 * 2 ** (attempt - 1),
};

let queue: Promise<unknown> = Promise.resolve();
let lastStartedAt = 0;

/**
 * Test seam. The pacing state above is module-level — it has to be, since the
 * limit applies across every caller — so a suite that does not reset it
 * inherits the previous case's clock.
 */
export function resetJikanPacing(overrides: Partial<typeof jikanTiming> = {}): void {
  queue = Promise.resolve();
  lastStartedAt = 0;
  jikanTiming.minIntervalMs = overrides.minIntervalMs ?? 400;
  jikanTiming.backoffMs = overrides.backoffMs ?? ((attempt: number) => 1000 * 2 ** (attempt - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastStartedAt + jikanTiming.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastStartedAt = Date.now();
    return task();
  });
  // The chain must survive a rejected task, or one failure stalls every
  // request that queued behind it.
  queue = run.catch(() => undefined);
  return run;
}

export const MAX_ATTEMPTS = 3;

/**
 * Turns an upstream status into the one our client should see.
 *
 * 504 is Jikan's way of saying MyAnimeList did not answer — that is an outage
 * of the catalogue, not a bad request from us, so it reaches the caller as 503
 * with a message that says which layer failed.
 */
function describe(status: number): { status: number; message: string } {
  if (status === 404) return { status: 404, message: "Not found on MyAnimeList." };
  if (status === 429) {
    return { status: 429, message: "Too many requests to MyAnimeList. Please try again shortly." };
  }
  if (status === 500 || status === 503 || status === 504) {
    return { status: 503, message: "MyAnimeList is unavailable right now. Please try again later." };
  }
  return { status, message: `Jikan request failed (${status}).` };
}

export interface JikanFetchOptions {
  /** Treat 404 as an answer rather than a failure — used by getDetails. */
  allowNotFound?: boolean;
  /** Cache window in seconds. Listings change slowly; details barely at all. */
  revalidate?: number;
}

/**
 * Server-only fetch helper for Jikan v4. No API key — the whole of v4 is public
 * for reads. Never import from a Client Component; `server-only` makes that a
 * build-time error.
 *
 * Retries only what retrying can fix: rate limits and upstream hiccups. A 404
 * or a malformed query is returned as-is, because asking again changes nothing.
 */
export async function jikanFetch<T>(
  path: string,
  options: JikanFetchOptions = {}
): Promise<T | null> {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await schedule(() =>
        fetch(`${JIKAN_BASE}${path}`, {
          headers: { Accept: "application/json" },
          next: { revalidate: options.revalidate ?? 300 },
        })
      );
    } catch {
      lastStatus = 502;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(jikanTiming.backoffMs(attempt));
        continue;
      }
      throw new AnimeSourceError("Could not reach MyAnimeList.", 502, "jikan");
    }

    if (response.ok) {
      try {
        return (await response.json()) as T;
      } catch {
        throw new AnimeSourceError("MyAnimeList returned a malformed response.", 502, "jikan");
      }
    }

    lastStatus = response.status;

    if (response.status === 404) {
      if (options.allowNotFound) return null;
      throw new AnimeSourceError("Not found on MyAnimeList.", 404, "jikan");
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) break;

    // Honour Retry-After when Jikan sends one; it knows better than our curve.
    const header = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(header) && header > 0 ? header * 1000 : jikanTiming.backoffMs(attempt));
  }

  const { status, message } = describe(lastStatus);
  throw new AnimeSourceError(message, status, "jikan");
}
