# /tier-list and /youtube/tier-list: the promised landing page, before hydration too

## This finishes a decision already made, not a new one

`lib/seo/site.ts`'s `SITEMAP_ROUTES` already lists both routes with an
explicit comment: *"A visitor with no account sees an empty state and a way
in, which is a real landing page rather than a dead one."* So whether these
pages should be indexed was already decided — the remaining question, and
the whole scope of this task, was why that promised landing page never
actually reached the HTML a crawler reads. This is the continuation of the
indexing work from [PR #61](https://github.com/Rad1xx-io/cinetier/pull/61)
(`/feed`, `/u/[username]`) — `/tier-list` was the last of the same 21 URLs
Search Console flagged that was still open.

## The cause, confirmed by reading code

`components/tier-list/tier-list-board.tsx` reads `hydrated` from
`useRankedTitles()`, which is backed by `useSyncExternalStore` reading
localStorage. `lib/storage/ranked-titles-store.ts`'s `getServerSnapshot()`
correctly always returns `{ status: "loading" }` — localStorage doesn't
exist on the server, and that's exactly right; the store itself needed no
fix. But the `if (!hydrated)` branch rendered a bare `<Skeleton>` — four
empty placeholder bars, not one word of text — instead of the
already-built `<EmptyState/>` (`components/dashboard/empty-state.tsx`:
"Your tier list is empty", with links to `/discover`, `/anime`, `/games`,
`/youtube`) that already rendered one branch down, for "hydrated but
genuinely empty". `EmptyState` carries no `"use client"` directive and
reads no data at all — nothing about it needed hydration to exist safely.
The result: every server render of `/tier-list`, for every visitor, sent
back an empty Skeleton — the "real landing page" `site.ts` promises never
made it into the raw HTML a crawler sees. The same `hydrated`/`Skeleton`
pattern, confirmed the same way, existed in
`components/youtube-tier-list/channel-tier-list-board.tsx` for
`/youtube/tier-list` (`ChannelEmptyState`).

## The fix — merging two branches that now render the exact same thing

`!hydrated` and `titles.length === 0 && channels.length === 0` (`channels.length === 0`
alone for the YouTube board) are now one condition, one shared wrapper
(`mx-auto max-w-3xl px-4 py-10 md:px-6` — previously the two branches had
different container classes for no reason beyond rendering different
content; rendering the same content now, they get the same wrapper), one
`<EmptyState/>`/`<ChannelEmptyState/>`. The unused `Skeleton` import was
removed from both files — nothing in either component uses it any more.

This also removes a latent hydration risk rather than just changing copy:
before this fix, the server (which only ever takes the `!hydrated` path,
since it has no localStorage) and a slow client's pre-hydration paint could
in principle diverge from what a fast client settles on — Skeleton vs.
EmptyState were two different trees for what is, from the server's point
of view, the same unknowable state. Now both paths that don't yet know
whether there's real data render identically, so there is nothing left to
mismatch.

## `/tier-list` and `/youtube/tier-list` deliberately did **not** get `force-dynamic`

Unlike `/feed` in PR #61, where the fix required `export const dynamic =
"force-dynamic"` because Supabase data is the same for every visitor and
was getting baked into the build — here the situation is the opposite.
`ranked_titles`/`ranked_channels` live in *that specific visitor's own
browser's* localStorage; the server cannot know them and isn't supposed
to. The server's job is to hand every visitor the same generic landing
copy, which is exactly what static prerendering (`○`) already does,
correctly, both before and after this fix — `npm run build` confirms both
routes stay `○`; only what that static HTML contains changed.

## Verified in raw HTML, per the same method as PR #61

Built and served the production output on a spare port, then read the
response with `curl` — no JavaScript executed:

- **`/tier-list`**: "Your tier list is empty", the full description text,
  and all four catalog links (`/discover`, `/anime`, `/games`, `/youtube`)
  present in the raw response. The only `animate-pulse` match left in the
  page is the unrelated header auth-avatar placeholder (present on every
  page for a signed-out session, untouched by this task) — the tier-list
  board's own Skeleton is gone entirely.
- **`/youtube/tier-list`**: "Nothing here yet", the description, and the
  "Find channels" link to `/youtube`, same result.

## Verified in the browser for hydration correctness

Served the production build, opened `/tier-list` and `/youtube/tier-list`
in the Claude Browser pane, and read the console — no `Hydration failed` /
`did not match` warnings in either case, signed-out and empty. Then seeded
`localStorage` directly (`cinetier:rankings:v1` / `cinetier:youtube-rankings:v1`)
with one real title / one real channel and reloaded: the console stayed
clean (still no hydration warnings), and the page text confirmed the real
board rendered correctly — "Inception" in tier S on `/tier-list`, "A Test
Channel" in tier S on `/youtube/tier-list` — with no visible flash back to
the empty state. A visitor with something already ranked never sees this
landing at all; hydration and the swap to the real board land before the
first paint a human eye would catch, exactly as it already did when this
branch was a Skeleton.

## What's new

- **`components/tier-list/tier-list-board.tsx`** — `!hydrated` and the
  empty-board check merged into one condition rendering `<EmptyState/>`;
  unused `Skeleton` import removed.
- **`components/youtube-tier-list/channel-tier-list-board.tsx`** — same
  merge, rendering `<ChannelEmptyState/>`; unused `Skeleton` import
  removed.

## Tests

- **`__tests__/tier-list-board-empty-landing.test.tsx`** (new, 6 tests) —
  for each board: the real EmptyState/ChannelEmptyState copy renders before
  hydration (`hydrated: false`) with no `.animate-pulse` element anywhere
  on the page; the exact same copy renders once hydrated with nothing
  ranked; the real board (not the empty state) renders once hydration
  lands with something ranked.
- Verified with a negative control on both components: reintroducing the
  old `Skeleton` branch for `!hydrated` made the corresponding "renders the
  real EmptyState/ChannelEmptyState before hydration" test fail as
  expected (`Unable to find an element with the text: …`), confirming the
  tests actually pin the fix rather than passing vacuously; reverted
  immediately after.

## Verification

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing, unrelated warning) |
| `npm run typecheck` | clean |
| `npm test` | 1328 passed, 103 files (was 1322/102) |
| `npm run build` | clean — `/tier-list` and `/youtube/tier-list` stay `○` (static) before and after, as expected |
| `npx playwright test` | 15 passed, including the `tier-list-clear-and-menu` suite which exercises `/tier-list` with real data |
| Raw HTML via `curl` against a production build | both routes now carry real landing copy, no Skeleton |
| Browser console (production build, empty and seeded localStorage) | no hydration-mismatch warnings in either case |

No migration in this task — nothing here touches a database table; the
only store involved is localStorage, and `getServerSnapshot()`'s existing
behavior was left exactly as it was, per the brief.

## One adjacent, out-of-scope note

`site.ts`'s own comment on `SITEMAP_ROUTES` says `/u/*` is "deliberately
absent... worth adding once the sitemap is allowed to read the database" —
PR #61 already gave `lib/supabase/public-read.ts` exactly that capability
(`getPublicTierListServer`), so the sitemap itself could plausibly grow
`/u/<username>` entries now. Not attempted here: which usernames, at what
volume, and with what pagination against `PUBLIC_PROFILE_LIMIT` is a
product call, not something this task's diagnosis touched.
