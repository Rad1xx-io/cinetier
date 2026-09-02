# Custom-board publishing — three bugs

Three independent reports, all around publishing Custom boards.

## 1 — Publishing an empty board was never blocked

Neither `publishCustomBoard` nor `publishPost` ever checked how many cards
were on the board — only title and description. An empty Custom board, or a
regular tier list whose *selected category* was empty, published exactly as
described: a post with a default title, an author, the "Photos" badge, zero
likes/comments/views, and no picture behind any of it.

**Fix, two layers, matching the request:**

- **In the publish functions themselves** (`lib/supabase/custom-lists.ts`,
  `lib/supabase/feed.ts`) — checked after the title/description validation, so
  the two errors are never shown for the same click. This is the layer that
  makes the rule true regardless of how it's reached.
- **In the UI, before the dialog opens** — an explicit message, not a silent
  disabled button. Custom board: the Publish button refuses via the existing
  `notice` paragraph. Regular tier list: the button refuses via `onNotify`,
  the same channel already used for "sign in to publish."

**The regular tier list had a second, narrower case.** The whole board can be
non-empty while the *category chosen inside `PublishPostDialog`* filters down
to zero — the snapshot is scoped to the picked category, not the whole board.
Caught inside the dialog itself: `hasContent` is computed once at render time
and reused for both the live message and the submit gate, rather than
recomputed separately in each place — this is the exact shape of bug Clear
List had (two places filtering the same thing, only one kept in sync), so it's
computed once this time.

**Tests:** `__tests__/publish-board-title.test.tsx` (function-level empty
check), `__tests__/custom-board-empty-publish.test.tsx` (button-level, new),
`__tests__/tier-list-actions-empty-publish.test.tsx` (button-level, new),
`__tests__/publish-post-dialog.test.tsx` (new describe block for the
empty-category case). Existing tests that happened to publish an empty board
as their baseline (`activation-funnel.test.ts`, `feed-snapshots.test.ts`,
`publish-post-first-event.test.ts`) were given real content — they were
testing something else and were incidentally exercising a state that is no
longer valid.

## 2 — No way to delete the board itself

Confirmed exactly as reported: a `deleteCustomBoard` function already existed
in `lib/supabase/custom-lists.ts`, with its own test
(`custom-storage-cleanup.test.ts`) — but **no UI component ever called it**.
The RLS policy that allows an owner to delete their own board has existed
since migration 012; the gap was purely the missing button.

**The real problem was deeper than a missing button.** The old implementation
deleted `custom_tier_lists` directly through the ordinary client. Tiers and
cards cascade away with it, and so does `custom_list_publications` (its
`list_id` FK is `on delete cascade`) — but `posts` carries no foreign key back
to the board at all. A plain delete would have left a published post orphaned
in the feed with nothing left to render: the same hole as bug #1, reached
through a different door. Verified concretely: `getPublishedBoards` would
return an empty map for that post, and `post-card.tsx` falls back to "This
author has not published their list" — the wrong message for a board that
*was* published and got deleted out from under its post.

**Fix:** new migration **024**, `delete_custom_board(p_list_id uuid)` —
SECURITY DEFINER, same shape as `clear_tier_row_image`. It looks up the
post via `custom_list_publications` by reading the table directly (bypassing
its read-facing RLS policy on purpose — that policy governs what a *reader*
may see, including a `hidden_at` pause nothing in the app sets today but might
later; this function re-derives ownership from `auth.uid()` itself, so going
around it here is safe), deletes the post first if one exists, then the board.
Ownership and the moderation block (`is_blocked('custom_list', id)`) are both
re-checked inside the function — the same defense-in-depth every definer
function here uses. **A board under a moderation block cannot be deleted by
its own owner**, matching the existing RLS DELETE policy exactly: a block its
subject can delete their way out of is not a block.

`deleteCustomBoard` now calls this RPC instead of deleting the row directly,
still collecting and sweeping orphaned files afterward. `BoardGrid` (`/custom`)
is now a client component with local state; each board card gets an
`OverflowMenu` (reused, not reinvented) with a destructive "Delete board" item
and a `window.confirm` whose wording depends on `isPublished` — a new field on
`CustomBoardSummary`, computed with one extra batched query.

**Tests:** `supabase/testing/21_custom_board_deletion_checks.sql` — deleting
an unpublished board (removes tiers, reports no post removed), deleting a
published board (removes the post, the publication row, the board itself —
this is the hole the migration closes), refused for a different account,
refused for a blocked board even by its owner, `anon` cannot execute it.
`__tests__/custom-storage-cleanup.test.ts` extended: goes through the RPC
rather than a direct delete, reports `removedPost` correctly, surfaces a
refusal instead of touching storage.

**Verified visually** in the browser against a fixture route (created and
removed for this check, not part of the deliverable): the overflow menu opens
correctly at the leftmost card without clipping, and the confirm text differs
correctly — "It also removes its post from the feed…" for a published board,
"This board was never published…" for an unpublished one.

## 3 — Was there ever a content-confirmation step at publish time?

Investigated in git history before touching anything, per the instruction.
**Conclusion: no, there never was one — nothing to restore.**

Checked: full pickaxe search across all history for `confirm`, `guideline`,
`rules`, `rightsConfirmed`, and any `window.confirm` near a publish action;
the complete commit history of both publish dialogs from their very first
commit (`c0f275d` for the feed, `8c8786a`/`12b94d1` for the custom board).

What actually exists, and has existed unchanged since it was introduced
(`8c8786a`, never modified since): the checkbox **"I confirm I have the right
to use this image and that it does not break the site's rules"** in
`UploadDialog` — but that's a per-**picture** confirmation at **upload** time,
enforced both client-side and server-side (`issue_upload_grant` raises if
`p_rights_confirmed` is not true). It has never been a publish-time step for
the whole board.

If anything, the trend went the other way: before `12b94d1` ("Ask what the
post should be called"), publishing a Custom board was a single click with
*no* dialog at all — no title, no description, nothing. That commit added
friction, it didn't remove any.

**Denis's call, asked directly: add it now, in this PR.** New checkbox — "I
confirm this post follows the site's content rules." — in both dialogs,
`PublishBoardDialog` and `PublishPostDialog`. Deliberately different wording
from the upload-time checkbox: that one is about one picture, at upload; this
one is about the post as a whole, at publish, and applies to a regular tier
list too (no uploaded pictures at all). The shared text lives in one place —
`RULES_CONFIRMATION_LABEL` in `lib/feed/post-preview.ts` — so both dialogs say
exactly the same sentence.

**Enforcement mirrors the upload flow's `rightsConfirmed`, and bug #1's own
fix:** the checkbox disables Publish in the UI, and the boolean is also
threaded through as an explicit parameter to `publishCustomBoard`/`publishPost`,
checked again inside the function — not because the UI can be tricked, but
because a check that only lives in a disabled-button is not a check, it's a
suggestion; the function is what makes it true regardless of how it's reached.

**Honestly scoped limit, stated rather than hidden:** unlike the upload and
delete-board flows, `publishCustomBoard`/`publishPost` still write to
`posts`/`custom_list_publications`/`ranked_title_publications` through plain
client inserts, not a `SECURITY DEFINER` RPC — so a caller with a valid JWT
could in principle reach the PostgREST API directly and skip both this check
and bug #1's empty-board check. This is not a new hole from this change — bug
#1's fix already had the same characteristic, at the same layer, and nobody
asked for the publish pipeline to be rearchitected into an RPC. Worth flagging
as a real candidate for a future security pass, not something to fix quietly
as a side effect of adding a checkbox.

**Tests:** new "content-rules confirmation" describe block in
`publish-post-dialog.test.tsx` (starts unticked, blocks submit, resets on
reopen), a matching new test in `publish-board-title.test.tsx`. Every existing
test that filled in a publish form and expected success now also ticks the
box — the same kind of fixture update bug #1's empty-board check needed,
same reason: a state the tests used to treat as valid no longer is.

**Verified visually** against the same `/e2e/custom-board` fixture used for
bug #1: the checkbox renders with the exact label text, Publish stays
disabled with a valid title until it's ticked, and ticking it enables the
button immediately.

## Verification

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing warning) |
| `npm run typecheck` | clean |
| `npm test` | 1200 passed, 89 files (was 1182 / 87) |
| `npx playwright test` | 15 passed |
| `npm run build` | clean |
| `supabase/testing/run.sh` | all checks pass, including the two new ones |
| `run.sh --negative` | both exploits still demonstrated |
| `run.sh --fresh` | migrations 002–024 apply to an empty database |

No negative control was weakened. No migration was edited in place — 024 is
new, append-only.
