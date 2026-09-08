# Migration 031 was never applied to production — that's the whole cause

Denis's own diagnosis, from a real console screenshot, was already correct before this started: `42703`, `column ranked_titles.source does not exist`. Confirmed, fixed, verified — no code changed, only the database.

Evidence vocabulary: **VERIFIED** (measured here, right now) · **CODE VERIFIED** (read, no runtime instrument) · **INFERRED** · **UNKNOWN**.

## What was actually wrong

**VERIFIED, not assumed from the error text alone.** `information_schema.columns` on `public.ranked_titles` showed no `source` column at all, before anything was touched. `pullCloudTitles`'s exact select (`lib/storage/cloud-sync.ts:98`) run directly against production reproduced the identical failure Denis saw — same code, same message, word for word:

```
ERROR: 42703: column "source" does not exist
```

Migration 031 (2026-09-06, PR #81) made that column `not null` in the code's expectations; the code shipped, the migration against production's database did not. `sign-in sync aborted, local board left untouched` firing three times in a row is `pullWithRetry` doing exactly its job — retrying a failure that was never going to succeed on its own, and correctly leaving the local board alone rather than overwriting it with a failed pull.

**One thing worth Denis knowing, not resolved here:** the 2026-09-06 `DECISIONS.md` entry for this same migration claims it was live-verified against "a real Supabase" — and this project has only one Supabase project, the same one `next dev` and production both point at. That claim and today's finding don't reconcile cleanly. Two candidates, neither confirmed: the migration went through then and something later reset it, or that `apply_migration` call silently didn't land — this session saw repeated Supabase MCP socket drops earlier on, the same failure mode. Not guessed at further; recorded honestly in `DECISIONS.md` as an open question rather than picked to make the story tidy.

## What was checked before applying

Read `031_ranked_title_source.sql` in full before running it. It defines no function with a commented body — only `alter table`, constraints, and `do $$ ... $$` self-checks — so the 2026-09-06 rule (hand-apply through the SQL Editor because `apply_migration` strips comments from function bodies) does not apply to this one. Applied through `apply_migration`, as usual for everything else.

## Before / after

| check | before | after |
|---|---|---|
| `information_schema.columns`, `ranked_titles.source` | absent | `text`, `not null`, default `'native'` |
| `pullCloudTitles`'s exact select, run directly | `42703` | one real row back, `source: "native"` |
| data shape | — | 22 movie + 17 anime rows → `source = 'native'` (fact, per the migration's own reasoning); all 50 existing game rows → `source = 'unknown'` (honestly unresolved, not backdated by a guess); zero rows outside `('native','steam','igdb','unknown')`; zero violations of `(media_type = 'game') = (source <> 'native')` |

The migration's own closing self-check block ran as part of `apply_migration` and would have raised and failed the whole call on any of the above — it didn't, so this table is what actually landed, not what was merely intended.

## What was deliberately not touched

- **The client-side banner and retry logic** (`sync-status-banner.tsx`, `cloud-sync-provider.tsx`) — already correct, as asked. Denis's banner clears on its own at the next successful sync; nothing to walk him through.
- **The one-off 504 against `ranked_channels`** in the same screenshots, with a side CORS warning — left alone, as asked. If the banner survives this fix, that's the next thing to look at, separately from today's cause.

## Record

Full account in `.ai/DECISIONS.md` (2026-09-10 entry), including the unreconciled claim above, in the same before/after format this project already uses for every migration applied to production.
