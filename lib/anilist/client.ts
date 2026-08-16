import "server-only";
import { unstable_cache } from "next/cache";

const ANILIST_URL = "https://graphql.anilist.co";

/** Discovery listings change slowly; repeated requests in one session should not hammer AniList. */
const REVALIDATE_SECONDS = 300;

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
 * One round trip to AniList, with no caching of any kind. Throws on every
 * failure, including the ones that arrive dressed as success.
 *
 * Exported for tests — application code goes through `anilistFetch`, which adds
 * the caching this deliberately leaves out.
 */
export async function anilistFetchUncached<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      // Caching happens a layer up, keyed on the query, and only for results
      // that came back whole.
      cache: "no-store",
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

/**
 * Server-only fetch helper for AniList's public GraphQL API. No API key —
 * Media/Page/GenreCollection queries are fully public for reads. Never import
 * from a Client Component; "server-only" makes that a build-time error.
 *
 * The caching sits in `unstable_cache` rather than in `next: { revalidate }` on
 * the fetch, because GraphQL reports failure inside a 200 response. Next's Data
 * Cache stores any 200 it sees, so a rate-limit error or a validation failure
 * would be served back for the next five minutes — an outage outliving itself.
 * `unstable_cache` writes only when its callback resolves, so a thrown error is
 * never stored, and the next caller gets a real attempt.
 */
export async function anilistFetch<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  // The key has to carry both, or two different queries share one entry.
  const cached = unstable_cache(
    () => anilistFetchUncached<T>(query, variables),
    ["anilist", query, JSON.stringify(variables ?? {})],
    { revalidate: REVALIDATE_SECONDS }
  );
  return cached();
}
