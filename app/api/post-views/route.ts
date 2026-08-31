import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimitOrNull, viewerKeyFor } from "@/lib/rate-limit/limiter";

/**
 * Counting that somebody looked at a post.
 *
 * This used to be a direct `supabase.rpc("increment_post_views")` from the
 * browser, which meant the only thing standing between one visitor and an
 * arbitrary number of views was a React ref. The route exists for one reason:
 * a browser cannot tell the database who it is, and the database cannot see
 * past PostgREST to find out. Here the address is visible, so an anonymous
 * reader can be given a stable, opaque handle — and one anonymous reader can
 * be told apart from another without either of them being recorded.
 *
 * The database still does not trust this. `increment_post_views` de-duplicates
 * on whatever key it is handed and caps each post's counter regardless, so a
 * caller who skips this route entirely is bounded too (migration 018). This
 * layer is what keeps that ceiling from being reached by ordinary traffic.
 */

export const dynamic = "force-dynamic";

/** A uuid, and nothing else, before anything is written. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "post-view");
  if (limited) return limited;

  if (!isSupabaseConfigured()) {
    // Guest-only deployments have no feed to count views for.
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  let body: { postId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const postId = typeof body.postId === "string" ? body.postId : "";
  if (!UUID.test(postId)) {
    return NextResponse.json({ error: "Invalid post id." }, { status: 400 });
  }

  /*
   * The session is read to identify the viewer, not to authorise anything —
   * a signed-out visitor's view counts exactly the same. Being recognised only
   * changes which key the de-duplication uses, and an account is a better key
   * than an address: it survives a phone moving between networks, and it is
   * one a client cannot forge into somebody else's.
   */
  let userId: string | null = null;
  try {
    const session = await getSupabaseServerClient();
    if (session) {
      const { data } = await session.auth.getUser();
      userId = data.user?.id ?? null;
    }
  } catch {
    // An unreadable session is an anonymous one, not an error worth returning.
  }

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.rpc("increment_post_views", {
    p_post_id: postId,
    p_viewer_key: viewerKeyFor(request, userId),
  });

  if (error) {
    console.error("TierListOnline: a post view could not be counted —", error.message);
    // A view that did not count is not worth telling the reader about; the
    // page they are looking at is unaffected either way.
    return NextResponse.json({ ok: false }, { status: 202 });
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
