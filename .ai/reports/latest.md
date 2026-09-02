# Custom boards — stale list after creating, and a real way back

## 1 — The list didn't know a board had just been created

Confirmed exactly as reported. `CreateBoardForm` writes the board, then calls
`router.push('/custom/${id}')` to land on it — a client-side navigation. Next
reuses the `/custom` page's **Client Cache** entry — the RSC payload it
fetched the one time this page was first loaded — for browser back/forward
navigation, regardless of any `staleTimes` setting. That reuse is
unconditional: the vendored docs (`node_modules/next/dist/docs/01-app/
04-glossary.md`, under "Client Cache") say plainly that "Pages are not
cached by default but **are reused during browser back/forward
navigation**," and the `staleTimes` reference doc adds explicitly that
configuring it "doesn't change back/forward caching behavior." So pressing
Back replayed the exact snapshot from before the board existed — not a
missing revalidation on the server, a client-side cache the browser's own
Back button is specifically built to serve from instead of asking again.

**Fix:** `router.refresh()`, called right after the board is created and
right before the `router.push` that leaves the page
(`components/custom-list/create-board-form.tsx`). The same glossary entry
lists `router.refresh()` as one of the documented ways to invalidate the
Client Cache, and this codebase already leans on it for exactly this
purpose — `custom-board.tsx`'s own `refresh` callback exists because
uploading a picture needed the same kind of invalidation for the page you're
*on*; this is the same fix one page earlier, for the page you're about to
leave.

**Looking further, since the report invited it** ("либо пересмотреть откуда
список берёт данные"): the same defect exists for four more actions on
`/custom/[id]` that never left the page but still change something
`/custom`'s list shows — deleting a card and hiding a card (both change the
cover picture and the item count), toggling public/private (changes the
badge), clearing the whole board, and publishing (changes whether the delete
confirmation warns about a live post). None of these called `refresh()`
either; all five now do. This is the same root cause reaching the same
symptom through five doors instead of one — worth closing all of them while
already here, not just the one that got reported.

**Tests:** `__tests__/create-board-form.test.tsx` (new) — `refresh()` is
called, and called before the `push`, on success; neither is called on a
refused write. `__tests__/custom-board-list-refresh.test.tsx` (new) —
`refresh()` fires for delete-item, hide-item, toggle-visibility,
clear-board, and a successful publish; does not fire for a refused publish.
Verified as a negative control, not just as a pass: removing the call from
`handleDeleteItem` makes its own test fail with the expected assertion
message.

**Not end-to-end browser-verified live**, for the same reason as earlier
tasks this session: no signed-in test session is available here. The `href`
half of task 2 (see below) *was* verified live against the `/e2e/custom-board`
fixture, and the `router.refresh()` mechanism itself is the one already
proven working in this exact file for uploads — this is the same call, one
step earlier, backed by the vendored Next.js docs rather than by guessing.

## 2 — A real "back" link, not the browser's own

Added to `/custom/[id]` — "← Your boards", pointing at `/custom` — matching
the pattern already established for `/title/[id]`, `/anime/[id]`,
`/games/[id]` and `/youtube/channel/[id]`, all four of which already carry a
real link back to the one catalogue page they are ever drilled into from
(`/discover`, `/anime`, `/games`, `/youtube` respectively), rather than
leaning on browser history. `/custom/[id]` had the identical shape — one
canonical parent list — and was the one page in that family without it.

Shown only to the board's owner (`canEdit`). A shared board is reached by a
link from anywhere — Discord, a DM, a forum post — with no "boards list of
your own" to send that viewer back to; a fixed link would be wrong for most
of them. Browser Back is already the correct tool there, which is why it is
left alone.

**Considered and deliberately not added**, using the same test the existing
pattern already applies — does this page have exactly one canonical parent
it's drilled into from:

- `/u/[username]` — reached from a feed post's byline, search, or a link
  shared outside the app entirely. No single correct "back to."
- `/battle/[id]` (the voter's view) — same shape as a shared board: reached
  by a link from anywhere. `battle-owner-view.tsx` already has "Back to my
  list" for the battle's *owner* specifically, which is the one case with an
  actual canonical destination.
- `/feed`, `/tier-list`, `/discover`, `/anime`, `/games`, `/youtube` — these
  are primary-nav destinations themselves, not pages drilled into from one
  particular list; nothing to point "back" to.

**Verified visually** against `/e2e/custom-board`: the link renders above the
title, unobtrusive, and clicking it lands on `/custom`.

**Test:** two new cases in `custom-board-list-refresh.test.tsx` — the link is
offered to the owner and points at `/custom`; it is not offered to a
non-owner viewer.

## Verification

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing warning) |
| `npm run typecheck` | clean |
| `npm test` | 1210 passed, 91 files (was 1200 / 89) |
| `npx playwright test` | 15 passed |
| `npm run build` | clean |

No migration in this task — both fixes are client-side. No negative control
was weakened.
