/**
 * Turning a report into something safe to send at a person.
 *
 * The reason on a report is typed by whoever is complaining, and it ends up in
 * two places that both interpret text: a chat webhook, and the server log. The
 * first version built its message by concatenation —
 *
 *   `TierListOnline: ${subjectType} reported\n${subjectId}\n${reason}`
 *
 * — which hands the reporter the newline. Three separate problems follow from
 * that one character. They can write lines that look like fields this message
 * does not have; they can write a second message that looks like a different
 * report; and on Discord and Slack they can write `@everyone`, which turns a
 * complaint about a picture into a notification for a whole server.
 *
 * None of that is fixed by escaping quotes, because the payload is already
 * JSON and the JSON was never what broke. What breaks is the *rendered*
 * message, so the text has to be flattened before it is rendered.
 */

/**
 * The most report text that is stored or forwarded.
 *
 * Matches the CHECK constraint on `content_reports.reason` from migration 012,
 * so the route refuses what the database would refuse rather than discovering
 * it at the far end. A thousand characters is several paragraphs — more than
 * enough to explain what is wrong with a picture.
 */
export const REPORT_REASON_MAX = 1000;

/**
 * The most rendered text sent to a webhook.
 *
 * Discord rejects a message body over 2000 characters outright and Slack
 * truncates around 3000, so this sits under the lower of the two with room for
 * the subject line. Enforced here rather than relying on either platform to
 * cope, because a rejected webhook is a report nobody hears about.
 */
export const NOTIFICATION_TEXT_MAX = 1800;

/**
 * Flattens attacker-controlled text into one renderable line.
 *
 * Three passes, each closing a different one of the problems above:
 *
 *   * Control characters — newline and carriage return included — become
 *     spaces, so the reason cannot grow lines of its own. This is what stops
 *     both the forged-field and forged-second-message shapes.
 *   * `@` and `<` get a zero-width space behind them, which leaves the text
 *     reading exactly as written while stopping `@everyone`, `@here`,
 *     `<!channel>`, `<!here>` and `<@user>` from being parsed as the mention
 *     syntax they are on Discord and Slack. The character is invisible, so a
 *     moderator reads the complaint the reporter actually typed.
 *   * Length is capped, with an explicit ellipsis so a truncated reason is
 *     visibly truncated rather than looking like the whole of a short one.
 *
 * Punctuation is otherwise left alone. Stripping it would make the reports
 * harder to read for no gain — the danger was never a full stop.
 */
export function flattenForNotification(raw: string, max = NOTIFICATION_TEXT_MAX): string {
  const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

  const collapsed = Array.from(raw)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      // C0 controls, DEL, C1 NEL, and the two Unicode line separators. Written
      // as code points rather than a regex class because that is the part that
      // has to be exactly right, and a literal control character in a source
      // file is invisible to whoever reviews it next.
      const isControl =
        code < 0x20 || code === 0x7f || code === 0x85 || code === 0x2028 || code === 0x2029;
      return isControl ? " " : ch;
    })
    .join("");

  const flattened = collapsed
    // Every newline and tab is already a space by this point, so splitting on
    // the space is enough to collapse the runs they left behind.
    .split(" ")
    .filter(Boolean)
    .join(" ")
    // Invisible to whoever reads the report, and enough to stop @everyone or
    // <!channel> parsing as the mention syntax it is on Discord and Slack.
    .replace(/[@<]/g, (char) => char + ZERO_WIDTH_SPACE);

  return flattened.length > max ? flattened.slice(0, max - 1) + String.fromCharCode(0x2026) : flattened;
}

export interface ReportNotification {
  subjectType: string;
  subjectId: string;
  reason: string;
}

/**
 * The webhook body.
 *
 * The identifying fields stay structured — a consumer that understands this
 * payload reads `subject_type` and `subject_id`, not a sentence — and only the
 * rendered summary is flattened, because only the rendered summary is where
 * the injection had somewhere to go.
 *
 * `text` and `content` are both present for the same reason they always were:
 * Slack reads the first, Discord the second, and an unknown endpoint gets both.
 * What is new is that neither is built from unflattened input, and that each
 * platform's own mention control is set as well:
 *
 *   * `allowed_mentions: { parse: [] }` tells Discord to resolve no mentions at
 *     all, whatever the text says. This is the authoritative fix on that
 *     platform; the zero-width spaces are the belt to its braces, for any other
 *     consumer that has no such switch.
 *   * `mrkdwn: false` tells Slack not to parse the text for its own control
 *     sequences, which is the equivalent switch there.
 *
 * `subjectId` is a uuid by the time it reaches here — the route rejects
 * anything else — so it needs no flattening, but it is passed through the same
 * function anyway rather than trusted on the strength of a check made
 * somewhere else.
 */
export function buildReportNotification(report: ReportNotification): Record<string, unknown> {
  const summary = [
    `TierListOnline: ${flattenForNotification(report.subjectType, 40)} reported`,
    flattenForNotification(report.subjectId, 64),
    flattenForNotification(report.reason, NOTIFICATION_TEXT_MAX - 200),
  ].join(" · ");

  const text = flattenForNotification(summary, NOTIFICATION_TEXT_MAX);

  return {
    text,
    content: text,
    allowed_mentions: { parse: [] },
    mrkdwn: false,
    subject_type: report.subjectType,
    subject_id: report.subjectId,
    reason: report.reason.slice(0, REPORT_REASON_MAX),
  };
}
