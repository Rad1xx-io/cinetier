import "server-only";
import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * What stands between an anonymous visitor and somebody else's API quota.
 *
 * The catalogue routes are public, unauthenticated, and each one spends budget
 * that does not belong to this project — a YouTube search costs 100 units of a
 * 10,000-unit day, and `discoverChannels` spends more than one call per visit.
 * Next's fetch cache does not help, because it keys on the url and a unique
 * query string is a cache miss by construction. So the limit has to be counted
 * here, before the upstream call, not hoped for downstream.
 *
 * The counter lives in Postgres (migration 017). It cannot live in this
 * process: Vercel runs these handlers as serverless functions, so a `Map` is
 * per-instance and per-cold-start, which is another way of saying it is not a
 * limit at all.
 */

/**
 * How much a family of endpoints is allowed to cost.
 *
 * Priced by what one request makes this server do upstream, not by how popular
 * the page is. YouTube is an order of magnitude stricter than the rest because
 * its quota is an order of magnitude scarcer: a hundred searches is the entire
 * day, so a budget generous enough to be invisible to a person is still far
 * below the point where an attacker achieves anything.
 *
 * Signed-in visitors get a higher ceiling on the same buckets. They are not
 * more trusted exactly — they are attributable, and an account that burns
 * through this can be dealt with, where an address cannot.
 */
export type RateLimitTier =
  | "search"
  | "details"
  | "youtube-search"
  | "reference"
  | "post-view"
  | "report"
  | "upload";

interface TierBudget {
  /** Requests per window, for a visitor with no session. */
  anonymous: number;
  /** Requests per window, for a signed-in account. */
  authenticated: number;
  windowSeconds: number;
}

const BUDGETS: Record<RateLimitTier, TierBudget> = {
  /*
   * The expensive one. A hundred of these is YouTube's whole day, so 10 a
   * minute is already far more than a person types and far less than an
   * attacker needs. Someone genuinely browsing channels hits `details` and the
   * cached list endpoints, not this.
   */
  "youtube-search": { anonymous: 10, authenticated: 30, windowSeconds: 60 },

  /*
   * TMDB, IGDB/Steam and AniList/Jikan search. Each is one upstream call with a
   * quota measured in thousands per day, and search-as-you-type is debounced in
   * the client, so this is set where a fast typist never notices it.
   */
  search: { anonymous: 40, authenticated: 90, windowSeconds: 60 },

  /*
   * A details page is one lookup for one id and caches well upstream, so it can
   * be looser — but it is still an outbound call, so it is not unlimited.
   */
  details: { anonymous: 80, authenticated: 200, windowSeconds: 60 },

  /*
   * Genre lists and other near-static reference data. Long upstream cache
   * lifetimes mean most of these never leave this server at all.
   */
  reference: { anonymous: 120, authenticated: 300, windowSeconds: 60 },

  /*
   * Registering that a post was looked at. Cheap — no upstream call, one row
   * touched — so the budget is about how fast one address may move counters,
   * not about cost. Opening a dozen posts a minute is ordinary browsing;
   * hundreds is a script. The database has its own per-post ceiling behind
   * this (migration 018), so this layer only has to make reaching it rare.
   */
  "post-view": { anonymous: 60, authenticated: 120, windowSeconds: 60 },

  /*
   * Filing a report. Deliberately tight: every one of these writes a row, logs
   * at error level and may fire a webhook at whoever moderates this site, so
   * the cost of an abusive one is somebody's attention. Nobody legitimately
   * reports ten things in a minute, and the duplicate constraint in migration
   * 019 already refuses the same target twice.
   */
  report: { anonymous: 5, authenticated: 10, windowSeconds: 60 },

  /*
   * Uploading a picture. The most expensive request this app serves — up to
   * 2 MB read into memory, sniffed byte by byte, then two counting queries and
   * a write to Storage.
   *
   * `issue_upload_grant` already caps a person at fifty granted uploads a day,
   * but that counts what succeeds. A request refused earlier — wrong format,
   * rights box unticked, oversized — never reaches the grant and so never
   * counted against anything, which left the expensive half of this route
   * unbounded for anyone with an account. This is the ceiling on attempts
   * rather than on results.
   *
   * Fifteen a minute is far above deliberate use (a person picks files one at
   * a time) and far below what a script needs to be a nuisance.
   */
  upload: { anonymous: 5, authenticated: 15, windowSeconds: 60 },
};

/**
 * Who is being counted.
 *
 * The account id when there is one — it survives a changed address, and a
 * shared office NAT should not put one person's browsing on another's budget.
 * Otherwise the client address, taken from the first hop of `x-forwarded-for`,
 * which on Vercel is the real client because the platform rewrites that header
 * rather than appending to whatever arrived.
 *
 * `unknown` is its own bucket rather than a free pass: if the address cannot be
 * read, everyone in that situation shares one budget, which fails toward
 * limiting rather than away from it.
 */
function identify(request: Request, userId: string | null): string {
  if (userId) return `user:${userId}`;

  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return `ip:${first}`;

  const real = request.headers.get("x-real-ip")?.trim();
  return real ? `ip:${real}` : "ip:unknown";
}

/**
 * The bucket key, hashed so it is opaque by the time it reaches the database.
 *
 * Two reasons it is an HMAC rather than the plain string. The table then holds
 * no addresses, so a limiter's bookkeeping is not also a log of who visited.
 * And the anon key is public — anyone can call `consume_rate_limit` directly —
 * so an unhashed key would let somebody burn down another visitor's budget by
 * naming their bucket. They still cannot raise their own, but they should not
 * be able to lower anyone else's either.
 *
 * With no secret configured the hash is still applied, so the table stays free
 * of addresses; what is lost is only that second property. Set
 * `RATE_LIMIT_SECRET` in production to keep it.
 */
function bucketFor(tier: RateLimitTier, identity: string): string {
  const secret = process.env.RATE_LIMIT_SECRET ?? "tierlistonline-unsalted";
  return createHmac("sha256", secret).update(`${tier}:${identity}`).digest("base64url").slice(0, 32);
}

/**
 * An opaque, stable handle for "this visitor", for callers that need to
 * recognise a repeat rather than count one.
 *
 * Used by /api/post-views to tell one anonymous reader from another without
 * sending an address to the database. Same HMAC as the limiter's own buckets
 * and for the same two reasons — nothing downstream stores an address, and a
 * key nobody else can compute cannot be used to impersonate another visitor's
 * view and suppress their count.
 *
 * Deliberately a different label from any rate-limit tier, so a view key and a
 * budget key for the same address are different strings and cannot be made to
 * collide.
 */
export function viewerKeyFor(request: Request, userId: string | null): string {
  const secret = process.env.RATE_LIMIT_SECRET ?? "tierlistonline-unsalted";
  return createHmac("sha256", secret)
    .update(`viewer:${identify(request, userId)}`)
    .digest("base64url")
    .slice(0, 40);
}

/**
 * A client with no cookies attached, used only to call the limiter RPC.
 *
 * Deliberately not `getSupabaseServerClient`: that one reads and writes auth
 * cookies, and the limiter has no business touching a visitor's session. The
 * RPC is security definer and takes its own decision, so the anon key is all
 * this needs.
 */
function limiterClient() {
  if (!isSupabaseConfigured()) return null;
  const { url, anonKey } = getSupabaseEnv();
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds to wait, when refused. */
  retryAfter: number;
}

export async function checkRateLimit(
  request: Request,
  tier: RateLimitTier,
  userId: string | null = null
): Promise<RateLimitDecision> {
  const supabase = limiterClient();
  /*
   * No database, no limit. This is a real decision rather than an oversight:
   * cloud accounts are optional in this app — the whole thing runs in
   * guest-only mode with no Supabase configured — and refusing every catalogue
   * request in that mode would break a supported way of running it. The same
   * branch covers a Supabase outage, where failing closed would turn one
   * dependency being down into the entire site being down.
   */
  if (!supabase) return { allowed: true, retryAfter: 0 };

  const budget = BUDGETS[tier];
  const limit = userId ? budget.authenticated : budget.anonymous;

  try {
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_bucket: bucketFor(tier, identify(request, userId)),
      p_limit: limit,
      p_window_seconds: budget.windowSeconds,
    });

    if (error) {
      // Logged loudly: a limiter that has quietly stopped limiting is the one
      // failure mode nobody notices until the quota is gone.
      console.error("TierListOnline: the rate limiter could not be consulted —", error.message);
      return { allowed: true, retryAfter: 0 };
    }

    const retryAfter = typeof data === "number" ? data : 0;
    return { allowed: retryAfter <= 0, retryAfter };
  } catch (err) {
    console.error("TierListOnline: the rate limiter threw —", err);
    return { allowed: true, retryAfter: 0 };
  }
}

/**
 * The signed-in account behind this request, verified, or null.
 *
 * `getUser()` rather than reading the cookie: a cookie is whatever the client
 * sent, and since being recognised here *raises* the ceiling, believing an
 * unverified one would hand the higher budget to anyone willing to forge it.
 * This is the reason the call is worth its cost.
 *
 * Imported lazily so the fast path below never pulls in `next/headers` or pays
 * for a client it does not use.
 */
async function verifiedUserId(): Promise<string | null> {
  try {
    const { getSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await getSupabaseServerClient();
    if (!supabase) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    // Treated as anonymous: the stricter budget is the safe direction to fail.
    return null;
  }
}

function refusal(retryAfter: number): NextResponse {
  /*
   * Says nothing about which limit was hit, how much budget is left, or what
   * identity it was counted against. A 429 should not double as
   * reconnaissance, and `Retry-After` is the one number a well-behaved client
   * actually needs.
   */
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/**
 * The refusal a route returns, or null when the request may go on.
 *
 * Returning a response rather than throwing keeps the check a single early
 * line in each handler, which is what makes it easy to see that it happens
 * before the upstream call rather than after it.
 *
 * Two passes, cheapest first. Nearly every request is inside the anonymous
 * budget and answers on the first one, with no session lookup at all. Only a
 * request that has already exceeded that budget is worth the cost of finding
 * out whether it belongs to an account — which is also precisely the moment
 * the distinction matters. A signed-in visitor is then re-counted against
 * their own bucket at the higher ceiling, so a busy account is never charged
 * for whoever else shares its address.
 */
export async function rateLimitOrNull(
  request: Request,
  tier: RateLimitTier
): Promise<NextResponse | null> {
  const anonymous = await checkRateLimit(request, tier, null);
  if (anonymous.allowed) return null;

  const userId = await verifiedUserId();
  if (!userId) return refusal(anonymous.retryAfter);

  const authenticated = await checkRateLimit(request, tier, userId);
  return authenticated.allowed ? null : refusal(authenticated.retryAfter);
}
