import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";
import { buildReportNotification, REPORT_REASON_MAX } from "@/lib/moderation/report-notification";

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

const SUBJECT_TYPES = new Set([
  "custom_item",
  // A tier's own picture, which had no way to be reported until migration 022.
  "custom_tier_row",
  "custom_list",
  "post",
  "post_comment",
]);

/**
 * Every subject this route can point at is a uuid column.
 *
 * Checked here rather than left to the insert: an unparseable value used to
 * reach Postgres and come back as a type error, which this route answered with
 * a 500 — a server fault reported for what is plainly a bad request, and one
 * that filled the log with somebody else's typo.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tells somebody, if there is somebody to tell.
 *
 * A log line is only a notification if a person is watching the logs, and the
 * point of a report is that it reaches whoever can act on it. Any webhook that
 * accepts a JSON body works — Slack and Discord both do — and with no url
 * configured this does nothing, so the report is still filed either way.
 *
 * Failure here is swallowed on purpose: the report is already in the database,
 * and losing the ping is better than answering the person who reported it with
 * an error.
 */
async function notify(report: { subjectType: string; subjectId: string; reason: string }) {
  const url = process.env.CONTENT_REPORT_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      /*
       * Built rather than concatenated. The reason is written by the person
       * complaining, and the old template dropped it into a multi-line string
       * — which let them add lines that read as fields this message does not
       * have, or as a second report entirely, or as `@everyone`. See
       * lib/moderation/report-notification.ts for what is done about each.
       */
      body: JSON.stringify(buildReportNotification(report)),
    });
  } catch {
    // See above.
  }
}

export async function POST(request: Request) {
  /*
   * Before the session is even read. Filing a report costs a row, a log line
   * at error level and possibly a webhook aimed at whoever moderates this
   * site, so the budget here is about somebody's attention rather than about
   * compute — see the `report` tier in lib/rate-limit/limiter.ts.
   */
  const limited = await rateLimitOrNull(request, "report");
  if (limited) return limited;

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
  const reason = String(body.reason ?? "").trim().slice(0, REPORT_REASON_MAX);

  if (!SUBJECT_TYPES.has(subjectType) || !UUID.test(subjectId)) {
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
    /*
     * 23505 is the unique index from migration 019: this person has already
     * reported this thing. Not a failure — their objection is on file, which
     * is what they wanted — so it is answered as such rather than as an error,
     * and it does not log or fire the webhook a second time.
     */
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "You have already reported this. It is on file." },
        { status: 409 }
      );
    }

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

  await notify({ subjectType, subjectId, reason });

  return NextResponse.json({ ok: true }, { status: 201 });
}
