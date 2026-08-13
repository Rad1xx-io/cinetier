import "server-only";

const ANILIST_URL = "https://graphql.anilist.co";

export class AniListError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AniListError";
    this.status = status;
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

/**
 * Server-only fetch helper for AniList's public GraphQL API. No API key —
 * AniList's Media/Page/GenreCollection queries are fully public for reads
 * (a token is only needed to mutate a user's own AniList list, which this
 * app never does). Never import from a Client Component — "server-only"
 * makes that a build-time error if attempted.
 */
export async function anilistFetch<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      // Discovery listings change slowly; a short cache keeps repeated
      // requests during a session from hammering AniList's rate limit.
      next: { revalidate: 300 },
    });
  } catch {
    throw new AniListError("Could not reach AniList.", 502);
  }

  if (response.status === 429) {
    throw new AniListError("AniList rate limit exceeded. Please try again shortly.", 429);
  }
  if (!response.ok) {
    throw new AniListError(`AniList request failed (${response.status}).`, response.status);
  }

  const body = (await response.json()) as GraphQLResponse<T>;
  if (body.errors?.length) {
    throw new AniListError(body.errors[0]?.message ?? "AniList GraphQL error.", 400);
  }
  if (!body.data) {
    throw new AniListError("AniList returned an empty response.", 502);
  }
  return body.data;
}
