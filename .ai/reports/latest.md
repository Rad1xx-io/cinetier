# Clear List now respects the active catalog filter

## Cause

`/tier-list` never has an "everything at once" view — the catalog picker has
no "all" entry by design (`CATALOG_FILTERS`, deliberately: a tier holding
films, games and channels side by side was never a ranking of anything).
`activeCatalog` is always exactly one of Films/TV/Anime/Games/YouTube.

Clear List never read it. It closed over the whole board's `titles`/`channels`
and wiped both stores completely, while its own dialog said the number that
made this look intentional: looking at Films with 5 titles and 3 more ranked
under TV, it asked to remove "8 titles" — the true total — while the person
asking had 3 in view.

## Fix

`TierListActions` now takes the active catalog as a prop. Clear List:

- **Films/TV/Anime/Games** — reads the store fresh (`getRatedTitles()`), keeps
  everything not in the active catalog, writes that back with `reorderAll`.
  Every other title's tier, order and criteria are untouched — they are never
  read, only titles matching the *other* catalogs are.
- **YouTube** — clears channels only (`clearAllChannels()`); titles are never
  touched, since YouTube has no catalog to split further.
- The confirmation dialog names the catalog and its own count: "Remove all 3
  Film titles from this list? Everything else on the board stays where it
  is." The old "the tiers stay, empty" line is gone — no longer accurate once
  a tier can still hold titles from every other catalog.
- The menu item disappears when the *active* catalog is empty, even if other
  catalogs have plenty — the old check summed both stores regardless of what
  was on screen.
- Nothing is cached: the count is computed fresh every render from the
  catalog and the live arrays, and the write reads the store again at click
  time rather than trusting whatever this component mounted with.

## Verified

**Unit** — `__tests__/tier-list-actions-custom-clear.test.tsx`, rewritten (the
old version asserted the bug — a whole-board clear — as the correct
behaviour). Covers: menu hidden on an empty active catalog with other
catalogs stocked; dialog names the right catalog and count, not the board
total; decline changes nothing; only the active catalog's titles are removed,
survivors compared by value; the count is read live rather than from mount
props; YouTube clears channels and leaves every title alone; singular wording
for exactly one.

Two negative controls, both confirmed by reverting the fix locally: the
visibility check and the "removes only the active catalog" check both fail
without it.

**E2E** — `e2e/tier-list-clear-and-menu.spec.ts`, extended with the exact
production shape: a board holding both Films and TV. Confirms the dialog text,
that TV survives untouched, that switching the filter to TV before opening
the menu changes what gets cleared (proving nothing is cached), and that the
menu item is absent on an empty catalog with titles elsewhere. Reverting the
fix and running just these: **4 of 6 fail** — the exact production bug,
reproduced and caught.

10/10 e2e tests pass with the fix in place. 894 unit tests, lint, typecheck
and build clean.

## Screenshots

`.ai/reports/shots/clear-list-before.png` — board with Films(3) + TV(5),
Films active. `clear-list-after.png` — after confirming Clear List: Films
tier empty, TV untouched. Confirm text captured live for both catalogs:

- Films: `Remove all 3 Film titles from this list? Everything else on the
  board stays where it is. This cannot be undone.`
- TV: `Remove all 5 TV titles from this list? Everything else on the board
  stays where it is. This cannot be undone.`

## PR and CI

**PR #44 — https://github.com/Rad1xx-io/cinetier/pull/44**

| check | status |
| --- | --- |
| `Typecheck, lint and test` | success (20:46:40 → 20:47:46) |
| `Browser test` | success (20:46:40 → 20:47:55) |
| `Vercel Preview Comments` | success |

`state: open`, `merged: false`, `mergeable_state: clean`, base `main`, 1
commit, 7 files changed, +343/−63.
