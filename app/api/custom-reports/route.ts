import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Someone objecting to a picture.
 *
 * A route rather than a direct insert from the browser, for one reason: this is
 * the only signal the site has that something is wrong, and it needs to leave a
 * mark somewhere a person will actually look. The row goes to the database; the
 * line goes to the server log, where the deployment's alerting can see it.
 *
 * There is no automatic moderation behind this. A report is read by a human or
 * it is not read at all — which is exactly why it must not fail quietly.
 */

const SUBJECT_TYPES = new Set(["custom_item", "custom_list"]);

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to report content." }, { status: 401 });
  }

  let body: { subjectType?: string; subjectId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed report." }, { status: 400 });
  }

  const subjectType = String(body.subjectType ?? "");
  const subjectId = String(body.subjectId ?? "");
  const reason = String(body.reason ?? "").trim().slice(0, 1000);

  if (!SUBJECT_TYPES.has(subjectType) || !subjectId) {
    return NextResponse.json({ error: "Nothing to report." }, { status: 400 });
  }
  if (reason.length < 3) {
    return NextResponse.json({ error: "Say briefly what is wrong with it." }, { status: 400 });
  }

  const { error } = await supabase.from("content_reports").insert({
    reporter_id: user.id,
    subject_type: subjectType,
    subject_id: subjectId,
    reason,
  });

  if (error) {
    console.error("TierListOnline: a content report could not be filed —", {
      subjectType,
      subjectId,
      message: error.message,
    });
    return NextResponse.json({ error: "The report could not be filed." }, { status: 500 });
  }

  // Deliberately at error level despite nothing having failed: this is the one
  // event here that wants somebody's attention today rather than in a weekly
  // digest, and error level is what the deployment's alerting watches.
  console.error("TierListOnline: content reported —", { subjectType, subjectId, reason });

  return NextResponse.json({ ok: true }, { status: 201 });
}
