import "server-only";

export class SteamError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SteamError";
    this.status = status;
  }
}

/**
 * Server-only fetch helper for Steam's storefront endpoints.
 *
 * No API key: the search / appdetails / featuredcategories endpoints used here
 * are the public storefront ones the Steam website itself calls, so nothing
 * secret ever reaches the client. They are undocumented rather than a published
 * API, so treat their shape as unstable and keep every caller defensive — a
 * missing field must degrade the card, never throw.
 *
 * They are also rate limited per IP, hence the generous revalidate window and
 * the caps on how many titles a single page enriches.
 */
export async function steamFetch<T>(url: string, revalidateSeconds = 900): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: revalidateSeconds },
    });
  } catch {
    throw new SteamError("Could not reach Steam.", 502);
  }

  // Steam answers an over-budget IP with a plain "Access Denied" 403 rather
  // than 429, so both mean the same thing to callers: backed off, try later.
  if (response.status === 429 || response.status === 403) {
    throw new SteamError("Steam rate limit exceeded. Please try again shortly.", 429);
  }
  if (!response.ok) {
    throw new SteamError(`Steam request failed (${response.status}).`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new SteamError("Steam returned a malformed response.", 502);
  }
}
