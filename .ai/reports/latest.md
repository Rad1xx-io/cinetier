# Import Letterboxd ratings into the tier list

## What this adds

A new page, [`/import/letterboxd`](../../app/import/letterboxd/page.tsx), linked from
Settings, that reads a Letterboxd ratings export, matches each film against TMDB, maps
its star rating onto the app's own S–F tiers, and — only after the account reviews and
confirms — writes the result into `ranked_titles` as one batch. Nothing is written on
upload; the whole point of this flow is that a fuzzy, TMDB-matched import is shown before
it touches anyone's list, not after.

Works signed out. A Custom board needs an account because every write there goes
straight to Supabase, but a ranked title is local-first the same way typing one in by
hand already is — an import is not different enough from that to suddenly require
signing in.

## Accepting the whole zip, not just `ratings.csv`

Letterboxd's export button gives a zip holding half a dozen CSVs (watched, diary,
watchlist, reviews, ratings…), because that zip — not any one file plucked out of it — is
what a person actually has after clicking Export. Requiring them to open an archive
manager and extract `ratings.csv` by hand first would be friction this app can absorb
instead, so the upload accepts either: a `.zip` is unpacked in the browser (`jszip`,
loaded lazily so the far more common "I already have the CSV" path never pays to parse
zip-reading code it doesn't use) to find `ratings.csv` wherever it sits inside; a bare
`.csv` is read directly. One control, both inputs work — not two buttons for the account
to have to choose between.

## Matching against TMDB — the existing endpoint, paced and scored

`/api/tmdb/search` is the same endpoint the catalogue's own search box already calls; a
second server route for the same lookup was never on the table. What the import *does*
add is everything a thousand-row bulk client-driven use of a per-minute-metered endpoint
needs that a single search box click never did:

- **Pacing.** Requests go out one at a time, 1.5s apart signed out / 800ms signed in —
  comfortably under half the `search` tier's real budget (40/min anon, 90/min
  authenticated), so an account still browsing the site mid-import is not the thing that
  trips its own rate limit.
- **429 handling.** A `Retry-After`-aware backoff, one retry per row; a row that fails
  twice in a row is left unmatched rather than retried forever — two refusals in a row
  reads as "the endpoint is down", not "this one row is unlucky".
- **Cancellable.** An `AbortController` lets a Cancel button during matching actually stop
  outstanding waits, not just hide the UI.
- **Confidence scoring**, via `fastest-levenshtein`'s `distance()` — already a project
  dependency, already used for the exact same kind of fuzzy title comparison in
  [`lib/search/normalize-query.ts`](../../lib/search/normalize-query.ts) — combined with
  release-year agreement into four levels: `exact`, `likely` (year off by one),
  `uncertain` (title or year didn't line up), `not-found`. This is what lets the preview
  pre-check confident rows and leave ambiguous ones for a human to look at, rather than
  trusting every fuzzy match equally.

One real bug caught by my own test before it ever reached a person: the year-agreement
check originally required `yearDelta === 0`, which is never true when the *source* row
has no year (Letterboxd's CSV can be missing it) — `yearDelta` is `null` then, not `0`,
so a perfect title match with no year data was being downgraded to `uncertain` for no
reason. Fixed by treating `null` — no evidence either way — as agreeing rather than as
the worst case; a source row with no year data at all can still be an `exact` match on
title alone.

## Star rating → tier, checked against what the tiers actually mean

Letterboxd rates in half-stars, 0.5 to 5.0 — ten values across the app's six tiers
(`lib/tier-meta.ts`'s S=Masterpiece … F=Bad/failure), so two tiers necessarily take a pair
of star values each. The split:

| Stars | Tier |
|---|---|
| 5.0, 4.5 | S |
| 4.0, 3.5 | A |
| 3.0 | B |
| 2.5 | C |
| 2.0, 1.5 | D |
| 1.0, 0.5 | F |

S and F get the paired extremes (4.5 and 5.0 both read as "loved it" the same way 0.5 and
1.0 both read as "actively disliked it"), while 3.0–4.0 — where a half star is doing the
most work distinguishing "good" from "great" — gets one tier per half-step. Checked
against `TIER_META`'s actual descriptions rather than picked by feel.

This mapping lives in a small generic module
([`lib/import/tier-mapping.ts`](../../lib/import/tier-mapping.ts)) — `ScaleTierMap` is
just "this scale's values, each naming a tier", and `mapRatingToTier` walks it for any
scale. Letterboxd's own map is one instance of it, not something the function knows about
by name; a future 10-point or 100-point source reuses the same function with its own
table.

## Duplicates: skipped, not overwritten — and why

A row whose TMDB match is already in the account's `ranked_titles` is left exactly as it
is; the import does not move its tier. This isn't new dedup logic — it's
[`forkTitles`](../../lib/storage/fork.ts)'s existing `"merge"` strategy, whose "the
account's own entry always wins a collision" rule is already exactly the behavior wanted
here, reused unchanged rather than reinvented.

The reasoning: a title already on someone's list means they already made a decision about
it some other way — by hand, possibly moved since — and an import silently overwriting
that on their behalf is the one outcome nobody asked for by clicking "import my ratings".
Re-tiering an existing title afterward is one click on the tier list itself; that's a
smaller ask than adding a second "update existing too?" toggle on top of an
already-multi-step review flow. The preview still tells the account which rows were
skipped this way ("Already in your list — skipped"), so the decision is visible, not
silent.

## The `first_title_ranked` / `first_post_published`-style funnel, replicated for a batch

`.ai/DECISIONS.md`'s 2026-08-27 entry established that "is this the first X" must be read
from state *before* the write, never after — a duplicate write returns the existing row
unchanged, so a post-write check misfires. `addTitle()` in
[`lib/storage/index.ts`](../../lib/storage/index.ts) already does this for
`trackFirstTitleRanked`; `useRankedTitles()`'s `add()` wrapper does it a second time for
`trackListCreationStarted(mediaType)`, the "first title of this media type" event.

A naive bulk import — looping `addTitle()` once per matched row — would have gotten both
of these right by accident (the first call in the loop would still see the pre-import
state) but at real cost: every mutating `RankingRepository` method does a full
read-parse-write-stringify pass over the entire localStorage blob
([`lib/storage/local-storage-repository.ts`](../../lib/storage/local-storage-repository.ts)),
so a thousand-row loop is a thousand full-list rewrites — O(n²) — for what should be one
write. `reorderAll` already exists as a genuine bulk-write path and doesn't call
`addTitle()` at all, so looping it would have silently dropped both analytics events for
every import, not just made them slow.

The fix: [`buildImportPlan`](../../lib/import/merge.ts) reads `currentTitles.length === 0`
and "does any current title have `mediaType: "movie"`" *before* calling `forkTitles`,
returning both facts on the plan. The panel fires `trackFirstTitleRanked` /
`trackListCreationStarted("movie")` at most once each, right before the single
`reorderAll` call — same rule as the per-title path, applied once for the whole batch
instead of once per row it doesn't loop over.

## Generalizing where it's easy, not further

This is explicitly the first of several planned import sources, so the split between
"generic" and "Letterboxd-specific" was made deliberately, but only as far as today's one
source actually justifies:

- **Generic, reusable as-is:** [`lib/import/csv.ts`](../../lib/import/csv.ts) (RFC
  4180-ish parsing — quoted fields, embedded commas and newlines, doubled-quote escaping —
  nothing Letterboxd-specific in it), [`lib/import/tier-mapping.ts`](../../lib/import/tier-mapping.ts)
  (`ScaleTierMap` takes any source's scale), [`lib/import/merge.ts`](../../lib/import/merge.ts)
  (dedup/plan-building takes a `MatchedRow[]`, not a Letterboxd type), and
  [`lib/import/match.ts`](../../lib/import/match.ts) (TMDB matching takes an `ImportRow[]`
  — title/year/rating/sourceUrl — that any source can produce).
- **Source-specific, kept separate on purpose:** only
  [`lib/import/letterboxd.ts`](../../lib/import/letterboxd.ts) — column names, the zip
  layout, the "Name"-column sniff used to reject a non-ratings file. A second source adds
  one sibling file shaped like this one and its own `ScaleTierMap`, not changes to the
  four generic modules above.

What this deliberately does *not* do: no source registry, no plugin interface, no
generic "pick your source" step in the UI. There is one source today; building a
selection mechanism for sources that don't exist yet would be solving a problem this task
doesn't have.

## What's new

- **`lib/import/csv.ts`** — `parseCsv`, `parseCsvWithHeader`.
- **`lib/import/types.ts`** — `ImportRow`, `MatchConfidence`, `TmdbMatch` (matching-only
  fields), `MatchedRow extends TmdbMatch` (+ `tier`, `alreadyRanked` — split out after
  self-review flagged the original single-type version as carrying unexplained
  placeholder values before the preview filled them in).
- **`lib/import/tier-mapping.ts`** — `ScaleTierMap`, `mapRatingToTier`,
  `LETTERBOXD_TIER_MAP`, `letterboxdRatingToTier`.
- **`lib/import/letterboxd.ts`** — `parseLetterboxdRatings`, `extractRatingsCsv`,
  `readLetterboxdRatingsFile`, `LetterboxdImportError`.
- **`lib/import/match.ts`** — `matchAgainstTmdb`.
- **`lib/import/merge.ts`** — `buildPreviewRows`, `buildImportPlan`.
- **`components/import/import-preview-table.tsx`** — the review table: thumbnail, matched
  vs. Letterboxd title, star rating, confidence label/hint, per-row tier override via the
  existing `QuickTierMenu`, checkbox (absent entirely for a `not-found` row — there's
  nothing to include).
- **`components/import/letterboxd-import-panel.tsx`** — the orchestrating flow:
  idle → reading → matching (progress bar, Cancel) → preview (review checkbox gates the
  Import button) → writing → done/error.
- **`app/import/letterboxd/page.tsx`** — `robots: noindex` (an account's own import tool,
  not a page to rank in search).
- **`app/settings/page.tsx`** — a new panel section linking to it, kept separate from the
  existing JSON backup import (`ImportExportPanel`) since that one is a trusted,
  no-review round-trip and this one fundamentally isn't.
- **`lib/analytics/events.ts`** — `trackImportStarted(source, rowCount)`,
  `trackImportCompleted(source, added, skippedDuplicates, unmatched)`. `source` is a
  plain string, not a one-member union, so a second import source doesn't need a second
  event definition.
- **`jszip`** — new dependency, client-side zip reading. 0 vulnerabilities, ships its own
  types.

## Tests

- **`import-csv.test.ts`** (10) — quoted fields, embedded commas/newlines, doubled-quote
  escaping, header mapping.
- **`import-letterboxd.test.ts`** (19) — column-order tolerance, missing/blank
  year/rating handling, the "Name"-column rejection for a non-ratings file (`watched.csv`
  shape), zip vs. plain-CSV dispatch by extension.
- **`import-letterboxd-zip.test.ts`** (5) — extracting `ratings.csv` from a real zip
  structure, at depth, and the "no ratings.csv in this zip" error.
- **`import-match.test.ts`** (11) — confidence levels, year-tiebreaking against a
  same-titled remake, the year-null fix above (failed before the fix:
  `expected 'uncertain' to be 'exact'`), 429/`Retry-After` backoff, abort mid-loop.
- **`import-merge.test.ts`** (13) — dedup keeps the existing tier untouched, `added` vs.
  `skippedDuplicates` counts, `isFirstTitleEver`/`startsMovieCatalog` computed before the
  write. Verified with a negative control: reintroducing the pre-existing-entry-loses bug
  in `forkTitles` (`lib/storage/fork.ts`) made the targeted test fail as expected, then
  reverted (`git diff --stat` empty afterward).
- **`import-letterboxd-panel.test.tsx`** (13) — file selection (zip and plain CSV), a
  non-ratings file surfaces its error without reaching the preview, an empty-but-valid
  file reports nothing to import, a confident match starts checked, a not-found row gets
  no checkbox, the Import button stays disabled until the review checkbox is ticked,
  unchecking a row before confirming keeps it out of the write, the done screen's counts
  and the `import_completed` event both reflect what actually happened, `authenticated`
  is passed through correctly to `matchAgainstTmdb`, both first-title analytics events
  fire exactly once for an empty account and not at all for one with existing titles,
  Cancel during matching returns to the file picker.

Not covered by Playwright: no existing "signed-out-safe" fixture route wraps this panel
the way `/e2e/custom-board` does for the board editor, and this session's sandbox could
not create the `C:\.claude\launch.json` the Browser pane preview tool needs (`EPERM` at
the drive root, not a project-directory restriction) to drive it manually either. The 13
component tests above do exercise the real DOM path — actual file `change` events,
actual checkbox clicks, the actual gated Import button — which is most of what a browser
click-through would additionally confirm; what it would *not* additionally confirm is
pure layout/visual correctness, which is genuinely unverified here.

## Verification

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing, unrelated warning) |
| `npm run typecheck` | clean |
| `npm test` | 1301 passed, 100 files — 0 uncaught exceptions, full suite green |
| `npm run build` | clean — `/import/letterboxd` prerenders as static (○) |
| `npx playwright test` | 15 passed (pre-existing suite; unchanged by this task) |

No migration in this task — `ranked_titles` already exists and takes writes through the
same `RankingRepository`/`reorderAll` path every other bulk write already uses.
