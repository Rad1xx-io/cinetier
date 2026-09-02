# Fork, extended to Custom boards

## What Fork means for somebody else's photographs

A regular fork copies `ranked_titles`/`ranked_channels` — pointers into a
shared catalogue (TMDB, IGDB, YouTube) that the app can re-fetch for anyone.
A Custom board has nothing like that: every card on it is a picture its owner
uploaded, reportable against them by name (migration 022), and not something
this app is entitled to hand a stranger a copy of on one click.

What *is* the app's own, reusable shape is the **tier structure** — how many
tiers a board has, what they're called, what colour they are. Forking a
Custom board now means exactly that: a new, empty board appears under the
forker's account with the same tiers, ready to fill with the forker's own
pictures. **No card, and no tier's own picture, is ever copied** — the type
that carries a source board's rows into the fork (`ForkableRow`) only has
`label` and `color` fields; there is nothing in the function's signature
capable of copying a picture even by mistake.

This was a real decision, not an obvious default, and it's worth being
explicit about the alternative considered and rejected: copying the cards too
would have been technically easy — a card only knows its `image_path`, a
pointer into shared Storage, and pointing two rows at the same file costs
nothing extra to write. It was rejected anyway, because "easy to write" was
never the question. Every card belongs to somebody who uploaded it under a
rights checkbox that says *they* are answerable for it (migration 012's
`p_rights_confirmed`) — duplicating it onto a stranger's board the moment
they click one button would let the fork itself become a way to redistribute
somebody's photograph without them ever being asked, and once forked, a
takedown against the original would not touch the copy at all. Copying only
the tier shape carries none of that risk while still delivering the actual
value of forking — starting from somebody's structure instead of a blank
board — so this is treated as settled, not as a placeholder pending a "real"
version.

## Reusing what already exists, not inventing a second mechanic

- **`allow_fork`.** The account-wide "let people copy my stuff" toggle
  already on every profile is reused as-is for Custom boards — no second,
  board-specific toggle. `getCustomBoard` now also resolves it for a
  non-owner viewer (skipped entirely for the owner's own view, where the
  question is meaningless).
- **The fork destination.** A regular post's Fork link goes to
  `/u/[username]`, where the *live* board actually lives — forking has never
  copied the frozen post snapshot, it copies whatever's there when the click
  happens. A Custom board has no per-profile "the board" the way ranked
  titles does; its board-specific analogue is the board's own page,
  `/custom/[id]`, already viewable by a non-owner for a public board (the
  Report button already lives there). The Fork control was added next to it,
  not invented as a new surface.
- **Analytics.** `trackForkClicked`/`trackForkCreated` — the same two events
  a regular fork already fires — are reused with real ids this time
  (`original_list_id`/`original_author_id`/`new_list_id` are literal board
  and account ids for a Custom fork, where the regular fork call site had to
  repurpose a username into the "list id" slot for lack of one).
- **Post-fork redirect.** Lands on the new board and calls `router.refresh()`
  first, exactly the fix from the previous task — a forked board is a
  created board, and skipping that call would reopen the same stale-`/custom`
  bug for the one new way of creating a board this task adds.

## One real divergence from the regular fork, and why

Forking a regular tier list works for a signed-out guest — the copy lands in
`localStorage` first, cloud sync is optional. Custom boards have **no**
guest form at all; every board write already goes straight to Supabase
(`createCustomBoard`, same as everything else in this file). So a
signed-out visitor sees the Fork button, and clicking it says "Sign in to
fork this board" rather than silently working — the same pattern
`tier-list-actions.tsx` already uses for Publish and Taste Battle when
nobody's signed in, not a new one.

## `allow_fork` can be genuinely unreadable, and the fallback direction matters

`profiles` RLS (migration 021) reads a row when `is_public OR own OR has
posted`. A Custom board's owner can have `is_public = true` on the *board*
while their *profile* is private and they've never posted anything — a real,
reachable combination, not a hypothetical — in which case their `allow_fork`
row is invisible to a third-party viewer. `getCustomBoard` distinguishes this
from "the column is null" (a pre-migration account, defaults to `true` like
everywhere else this pattern already exists) and defaults it to **`false`**
instead — the opposite of the usual `?? true`. An owner's preference this
function cannot verify is not a preference it can honour in their favour;
failing toward *not* offering a fork is the safer direction when the actual
answer is unknown, the same reasoning migration 024 already used for
`custom_list_publications`' own RLS gap two tasks ago.

## What's new

- **`lib/supabase/custom-lists.ts`** — `forkCustomBoard()`, and
  `getCustomBoard()` now also resolves the owner's `allow_fork` for a
  non-owner viewer.
- **`lib/types/custom-list.ts`** — `CustomBoard.allowFork`.
- **`components/custom-list/custom-board.tsx`** — a Fork button next to
  Report, shown to a non-owner viewer when the owner allows it; handles
  sign-in, success (refresh + redirect), and a refused write.
- **`components/feed/post-card.tsx`** — the `post.category !== "custom"`
  gate is gone. A custom post's Fork link now points at
  `/custom/${published.listId}` instead of `/u/[username]`, and is no longer
  gated on `post.isPublic` — that flag is the *author's profile* visibility,
  which is not the same thing as the *board's*, and reusing it for the
  custom branch would have been wrong in both directions (hiding Fork for a
  public board with a private-profile owner, or leaving it up after the
  board itself went private while the profile stayed public).

## Tests

- **`custom-board-fork.test.ts`** — `forkCustomBoard` copies label/colour in
  order, copies nothing that looks like an image path or url, falls back to
  the starter tiers when the source has none, and surfaces a write failure.
  `getCustomBoard`'s `allowFork`: `false` for the owner's own view even when
  the underlying row says `true`; a real value for a non-owner; `true` when
  the column is null; `false` when the profile row is invisible entirely —
  the case argued above.
- **`custom-board-fork-button.test.tsx`** — hidden for the owner and for a
  disallowed author; copies the visible rows' label/colour into the call;
  tracks the click regardless of outcome; refreshes and redirects on
  success; asks a signed-out visitor to sign in without attempting a write;
  surfaces a refused write without navigating away.
- **`post-card-custom-fork.test.tsx`** — links to the board's page, not the
  profile; absent when forking is off or there's no resolvable board;
  **present** despite a private author profile (the `isPublic` divergence);
  the regular-post path is unaffected.
- Both new negative-control checks were verified to actually fail: removing
  the sign-in guard crashes the handler (caught); removing the
  `custom_tier_rows` insert's error handling turns a reported failure into a
  silent success (caught).

**Regression, incidental but real:** adding `useSupabaseSession()` to
`custom-board.tsx` broke five existing test files that render `<CustomBoard>`
without mocking that hook — an uncaught exception during render that Vitest
flagged as a possible source of false positives, even though the assertions
in those files still happened to pass. Fixed by adding the same
`vi.mock("@/lib/hooks/use-supabase-session", …)` already used everywhere
else `<CustomBoard>` is rendered.

## Verification

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing warning) |
| `npm run typecheck` | clean |
| `npm test` | 1230 passed, 94 files, 0 uncaught exceptions (was 1210 / 91) |
| `npx playwright test` | 15 passed |
| `npm run build` | clean |

No migration in this task — `allow_fork` and every table it touches already
exist. Verified visually against `/e2e/custom-board`: the Fork button
appears for a viewer when the owner allows it, is hidden when they don't,
and clicking it signed-out shows the sign-in message.
