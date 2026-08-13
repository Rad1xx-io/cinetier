import "server-only";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const API_URL = "https://api.igdb.com/v4";

export class IGDBError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "IGDBError";
    this.status = status;
  }
}

/** IGDB is optional: without Twitch credentials the games section falls back to Steam. */
export function isIGDBConfigured(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

interface CachedToken {
  value: string;
  /** Epoch ms. Refreshed early so a request never races the expiry. */
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
/** In-flight refresh, so a burst of parallel queries mints one token, not N. */
let pendingToken: Promise<string> | null = null;

/** Twitch app tokens last ~60 days; renew an hour early rather than on failure. */
const RENEW_MARGIN_MS = 60 * 60 * 1000;

async function mintToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID!,
    client_secret: process.env.TWITCH_CLIENT_SECRET!,
    grant_type: "client_credentials",
  });

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, { method: "POST", body, cache: "no-store" });
  } catch {
    throw new IGDBError("Could not reach Twitch to authenticate.", 502);
  }

  if (!response.ok) {
    // A bad client id/secret is a configuration problem, not a transient one —
    // say so plainly instead of letting it surface as a generic 500 later.
    throw new IGDBError(
      `Twitch rejected the IGDB credentials (${response.status}). Check TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET.`,
      response.status === 400 || response.status === 403 ? 401 : response.status
    );
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new IGDBError("Twitch returned no access token.", 502);

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - RENEW_MARGIN_MS,
  };
  return cachedToken.value;
}

async function getAccessToken(): Promise<string> {
  // A pre-supplied token skips OAuth entirely — handy for local debugging.
  const manual = process.env.IGDB_ACCESS_TOKEN;
  if (manual) return manual;

  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  if (pendingToken) return pendingToken;

  pendingToken = mintToken().finally(() => {
    pendingToken = null;
  });
  return pendingToken;
}

/**
 * Server-only POST to IGDB. The body is APICalypse, IGDB's own query language —
 * a plain string, not JSON. Never import this from a Client Component; the
 * "server-only" import above makes that a build-time error.
 */
export async function igdbFetch<T>(endpoint: string, query: string): Promise<T> {
  if (!isIGDBConfigured() && !process.env.IGDB_ACCESS_TOKEN) {
    throw new IGDBError("IGDB is not configured on the server.", 503);
  }

  const token = await getAccessToken();

  let response: Response;
  try {
    response = await fetch(`${API_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": process.env.TWITCH_CLIENT_ID ?? "",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: query,
      // Catalog pages and search results change on the scale of days, so ten
      // minutes of reuse costs nothing in freshness and keeps repeat visits and
      // filter toggles off the network entirely. The cache key includes the
      // APICalypse body, so each distinct query caches separately.
      next: { revalidate: 600 },
    });
  } catch {
    throw new IGDBError("Could not reach IGDB.", 502);
  }

  // A token can be revoked before it expires; drop it so the next call re-mints.
  if (response.status === 401) {
    cachedToken = null;
    throw new IGDBError("IGDB rejected the access token.", 401);
  }
  if (response.status === 429) {
    throw new IGDBError("IGDB rate limit exceeded. Please try again shortly.", 429);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new IGDBError(
      `IGDB request failed (${response.status}). ${detail.slice(0, 200)}`.trim(),
      response.status
    );
  }

  return (await response.json()) as T;
}
