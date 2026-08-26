# Report handoff convention for `.ai/reports/`

Extends #43 (`.ai/DECISIONS.md`, `.ai/ARCHITECTURE.md`), same branch — this
is the same bootstrapping of `.ai/`, not a separate feature, so it went into
the still-open PR rather than a new stacked one.

## What changed

- `.ai/reports/README.md` — explains the convention itself: `latest.md` is
  overwritten every time a task finishes rather than accumulated, because
  history already lives in `git log` and in the PRs; `shots/` is cleared
  before every new round and files are named for what they show.
- `.ai/reports/shots/.gitkeep` — placeholder so the empty directory survives
  in git until the first round of screenshots lands in it.
- `.ai/ARCHITECTURE.md` — one section added, pointing at this convention so a
  fresh session finds it without being told.
- `.ai/reports/latest.md` (this file) — the first real use of the convention:
  its own setup, reported the way any other finished task would be.

## Verified

Documentation and empty scaffolding only — no code, no tests to run. Confirmed
`.ai/` is not matched by `.gitignore` (checked in #43) and that this diff adds
exactly four files with nothing else touched.

## PR and CI

*(placeholder — updated once the PR exists and its checks have run)*
