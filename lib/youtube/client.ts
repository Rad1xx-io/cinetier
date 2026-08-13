import "server-only";

const YOUTUBE_BASE_URL = "https://www.googleapis.com/youtube/v3";

export class YouTubeError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "YouTubeError";
    this.status = status;
  }
}

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new YouTubeError("YOUTUBE_API_KEY is not configured on the server.", 500);
  }
  return key;
}

/**
 * Server-only fetch helper for the YouTube Data API. Never import this from a
 * Client Component — the "server-only" import above makes that a build-time error.
 */
export async function youtubeFetch<T>(
  path: string,
  searchParams: Record<string, string | number | undefined>
): Promise<T> {
  const url = new URL(`${YOUTUBE_BASE_URL}${path}`);
  url.searchParams.set("key", getApiKey());
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      next: { revalidate: 300 },
    });
  } catch {
    throw new YouTubeError("Could not reach YouTube.", 502);
  }

  if (response.status === 429 || response.status === 403) {
    throw new YouTubeError("YouTube API quota exceeded. Please try again later.", 429);
  }

  if (!response.ok) {
    throw new YouTubeError(`YouTube request failed (${response.status}).`, response.status);
  }

  return (await response.json()) as T;
}
