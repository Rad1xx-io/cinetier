import "server-only";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export class TMDBError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TMDBError";
    this.status = status;
  }
}

function getToken(): string {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) {
    throw new TMDBError("TMDB_API_TOKEN is not configured on the server.", 500);
  }
  return token;
}

/** Default response localization. Overridable per-request via the `language` search param. */
export const DEFAULT_TMDB_LANGUAGE = "ru-RU";

/**
 * Server-only fetch helper for the TMDB API. Never import this from a Client Component —
 * the "server-only" import above makes that a build-time error if attempted.
 */
export async function tmdbFetch<T>(
  path: string,
  searchParams?: Record<string, string | number | undefined>
): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("language", DEFAULT_TMDB_LANGUAGE);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${getToken()}`,
        accept: "application/json",
      },
      // Popular/search results change slowly; a short cache keeps repeated
      // requests during a session from hammering TMDB.
      next: { revalidate: 300 },
    });
  } catch {
    throw new TMDBError("Could not reach TMDB.", 502);
  }

  if (response.status === 429) {
    throw new TMDBError("TMDB rate limit exceeded. Please try again shortly.", 429);
  }

  if (!response.ok) {
    throw new TMDBError(`TMDB request failed (${response.status}).`, response.status);
  }

  return (await response.json()) as T;
}
