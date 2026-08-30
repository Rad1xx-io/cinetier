# YouTube category now actually snapshots channels on Publish

`.ai/reports/shots/` cleared before this round, then three new screenshots taken
against the real built page: `youtube-post-card.png`, `youtube-post-dialog.png`,
`mixed-post-dialog-titles-and-channels.png`.

## PR and CI

_Filled in after the PR is opened and CI is confirmed — see chat for the final status table._

## The gap

`PublishPostDialog` never had a `channels` prop. A "YouTube" category post always
froze an empty snapshot regardless of what the author had actually ranked — flagged
as a known, out-of-scope gap in the previous task (`.ai/DECISIONS.md`, 2026-08-29,
last paragraph) and picked up here as its own task.

## The fork, and how it was resolved

`RankedChannel` (`lib/types/youtube.ts`) has no `tmdbId` — it can't fit
`RankedTitleSnapshotEntry`'s shape. The obvious precedent, `custom_list_publications`
vs `ranked_title_publications` being deliberately separate tables (`.ai/DECISIONS.md`,
2026-08-27), pointed toward a second table for channels too. Decided against it: that
split exists because a custom board is a genuinely different *kind* of post
(`category = 'custom'`, no catalogue at all). YouTube is not — it's one of the same
tier-list's existing catalog filters, and a "mixed"/Everything post must hold titles
*and* channels in the same post at once. Two tables would mean reading both on every
non-custom post just to support that one combined case. Instead, `ranked_title_publications.snapshot`
widened in place, in the same row: `{ titles: [...], channels: [...] }`. No migration
needed — `snapshot` is untyped `jsonb` with no `CHECK` on its shape; old rows without a
`channels` key read back as `channels: []`. Full reasoning in `.ai/DECISIONS.md`
(2026-08-30) and `.ai/ARCHITECTURE.md`.

## What changed

### Publishing

- `lib/supabase/feed.ts`: `RankedChannelSnapshotEntry`, `PostSnapshot` (the
  `{titles, channels}` wrapper, now `getPostSnapshots`'s return type), `buildSnapshot`
  (replaces `buildRankedTitleSnapshot`), `publishPost` takes an optional `channels`,
  new `getAuthorChannels` mirroring `getAuthorTitles` exactly (same `order("id")`
  before the cap, same reason).
- `PublishPostDialog` gained `channels?: RankedChannel[]`. In `handleSubmit`: channels
  go into the snapshot for `category === "mixed"` or `"youtube"`, `[]` otherwise.
  `titles` needed no new case for "youtube" — the existing `mediaType === category`
  filter already yields `[]` there, since no title's `mediaType` is ever `"youtube"`.
- `tier-list-actions.tsx` now passes `channels={channels}` through (it already held
  `channels` in scope for `CreateBattleModal`).
- Resolved, from the previous task's open question: "Everything" now means literally
  everything, channels included — not just the four catalogues that share a table.

### Rendering

- New `components/feed/channel-board.tsx` — `TierBoard`'s structure, `ChannelThumbnail`
  instead of `Poster` (a channel has no poster path, and looks like itself — a round
  avatar, not a film poster — through the same component every other channel view in
  the app already uses).
- `lib/feed/post-preview.ts`: `buildChannelTierRows`/`buildMiniChannelBoard`
  (mirrors `buildTierRows`/`buildMiniBoard`, kept separate rather than genericized —
  would have meant renaming `MiniTierRow.titles`, touching two already well-tested
  shared consumers for a form that's genuinely different), `channelsByAuthor`,
  `resolveSnapshotChannels`, `tierCountPhrase` (factored out of the existing
  "N tiers"/"one tier" ternary, now shared by both captions).
- `post-card.tsx` / `post-dialog.tsx`: both gained an optional `channels` prop and
  render `ChannelBoard` alongside `TierBoard` when channels are present — a "youtube"
  post shows only the channel board (no titles ever), a "mixed" post can show both,
  stacked, each with its own count line. The two catalogues are never merged into one
  set of tier rows — the live tier-list page never does that either (its picker
  always scopes to exactly one catalog).
- `post-dialog.tsx` also gained `getAuthorChannels`/`fullChannels`/
  `resolveSnapshotChannels`, mirroring yesterday's `fullTitles` fix exactly — the same
  bug for the same reason, closed here rather than left as a second known gap.
- `feed-view.tsx`: `authorChannels` state, `getAuthorChannels(authorIds)` added to the
  existing `Promise.all`, `channelsForPost` alongside `titlesForPost`, passed to both
  `PostCard` and `PostDialog`.

## Verified

- `npm run lint` — clean (1 pre-existing unrelated warning)
- `npm run typecheck` — clean
- `npm test` — 965/965 passing, including 27 new tests across
  `feed-snapshots.test.ts` (`getAuthorChannels` ordering, `publishPost` freezing
  channels thinly, `getPostSnapshots` defaulting a pre-existing row's missing
  `channels` key to `[]`), `feed-post-preview.test.ts` (`buildChannelTierRows`,
  `buildMiniChannelBoard`, `channelsByAuthor`, `resolveSnapshotChannels`,
  `tierCountPhrase`), `publish-post-dialog.test.tsx` (channels snapshot for YouTube,
  excluded from a single catalogue, included in Everything), and
  `post-dialog-full-board-snapshot.test.tsx` (a youtube post's dialog stays scoped to
  its own channel snapshot rather than the author's whole live channel list — the
  same shape of bug fixed yesterday for titles, caught here before it shipped)
- **Negative controls, both applied by temporarily reverting the real fix and
  re-running:**
  - Reverted `publish-post-dialog.tsx` → exactly the 4 new channel-scoping
    assertions failed, the pre-existing 14 kept passing.
  - Reverted `post-dialog.tsx` + `post-preview.ts` together → 4 of 5 dialog tests
    failed, including a genuine crash (`resolveSnapshotTitles` given a non-iterable
    wrapped snapshot) rather than only a text mismatch — confirms the tests exercise
    real code paths, not vacuous assertions.
- `npx playwright test` — 15/15 passing, including 2 new specs in
  `e2e/feed-youtube-post.spec.ts` against the real built page (network stubbed): a
  YouTube post's card shows its channel instead of "has not published their list",
  and its dialog shows the channel in full with "1 channel across one tier".
- `npm run build` — clean
- **Live screenshots**, taken with a throwaway Playwright script against the actual
  built `/feed` (same route-stubbing as the e2e spec, not a mock of the rendering
  code) rather than the in-app browser pane (blocked every JS/CSS chunk again this
  session — same known unreliability as two tasks ago): the card and dialog for a
  YouTube post, and the dialog for a mixed post showing both a title and a channel
  stacked in one section. All three in `.ai/reports/shots/`.

## Deliberately not addressed

Nothing left open from this task's own scope. The two things flagged in the previous
task's `.ai/DECISIONS.md` entry are both closed now: channels really do snapshot, and
Rad1xx's next YouTube-category publish will freeze the real channel, not an empty list.
