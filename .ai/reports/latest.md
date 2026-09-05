# A published post keeps the picture it was published with

**This is a deliberate reversal, not a bug fix.** Migrations 013 and 014 state the opposite intent in their own headers, at length and with reasons. Denis's decision is that a post should behave like a post on any social network: once published, nobody changes the photo. His earlier report — a picture vanishing from an already-published post after he deleted the card — was that design working exactly as built, not a regression of something already fixed.

The half 013 was right about does not change: **moderation still reaches a published post.** Everything below is shaped by keeping that true.

Evidence vocabulary: **VERIFIED** (executed/queried here) · **CODE VERIFIED** · **INFERRED** · **UNKNOWN**.

## The cascade question, which decided the design

Asked first, because both candidate mechanisms depend on the answer.

**VERIFIED, queried against production:** `content_moderation` is `(subject_type text, subject_id uuid, blocked_at, note)`, primary key on the pair, and **zero foreign keys**. A block is a free-standing fact. It does not cascade away when its subject row is deleted, and it can be placed on a subject that no longer exists.

So "is this card blocked?" stays answerable after the card leaves the board. Without that, keeping a picture alive past its row would have meant inventing a way to remember blocks separately — and that invention is where a moderation hole would have lived.

## Which mechanism, and why the other was rejected

**Chosen: keep the row (soft detach). Rejected: copy the path into the snapshot and add a second storage grant.**

Three facts, each checked rather than assumed, made the cheap option the safe one:

| checked | result |
|---|---|
| Can a card's picture be swapped after creation? | **No** — CODE VERIFIED. Migration 016 grants update on exactly `(row_id, position, caption, hidden_at)` and revokes insert outright. `image_path` is immutable to every client, so **a card's row *is* the frozen picture**. |
| Do published posts render tier pictures? | **No** — CODE VERIFIED. `PublishedBoard.rows` carries no image; `row.imageUrl` appears only in the live board editor. Tier paths never needed freezing. |
| Does a block survive its subject? | **Yes** — VERIFIED above. |

Because the row is the picture, keeping the row freezes the picture completely — with no new path to storage, and no second place where moderation could be got wrong. The existing SELECT policy on `custom_items`, which already calls `is_blocked('custom_item', id)`, stays the single place a card's visibility is decided, for the live board and the frozen post alike.

The rejected option would have needed an RLS policy searching a JSONB snapshot for per-item blocks, as a **second** moderation gate beside the existing one. More code, in the one area where a mistake is worst.

**The garbage collector needed no change at all** — which was the sharpest test of the choice. A detached row still references its path, so `removeUnreferencedFiles` reads the file as in use, at every one of its five call sites, without knowing publications exist. Under the rejected design each of those five sites would have needed a new rule.

Narrowing worth recording: only **two** of the five call sites could ever have orphaned a published picture. `deleteCustomBoard` cascades the publication away with the board (`custom_list_publications.list_id → ON DELETE CASCADE`, VERIFIED), and `clearTierRowImage`/`deleteTierRow` touch tier pictures, which posts never show.

## Direct delete is revoked, and that is the point

**VERIFIED:** `authenticated` and `anon` held `DELETE` on `custom_items`, so "remove this card" was a plain PostgREST delete. Leaving it would have made the freeze an app convention any other caller could step around.

Migration 029 revokes it and routes removal through `remove_custom_item` and `clear_custom_board`, which decide in the database, atomically, whether a card is spoken for by a publication. Same move 013 made with "no UPDATE policy" and 016 with column grants: the invariant belongs to the database, not to the app's good manners.

Both functions also re-check ownership and refuse on a board under review — a report must not be answerable by deleting the evidence.

## What hiding still does, and why that is deliberate

Hiding a card **still** removes it from a published post. That is a boundary, not an oversight: "frozen" means the author cannot *substitute* what was shown, but an author must keep a way to retract their own content. Without it, detaching would leave deleting the entire post as the only route. Blocking and hiding reach a published post; editing the board no longer does.

## Verification — all three directions

### 1. The direction Denis reported

- **VERIFIED (database):** publish a board, remove a card → the function reports `detached`, the row survives with `detached_at` set, and an **anonymous reader still resolves the original `image_path`**. Assertion: *"the already-published post still resolves the picture it was published with"*.
- **VERIFIED (unit):** `deleteItem` on a published card removes **no** file; clearing a board removes only the unpublished cards' files.
- **VERIFIED (unit):** a frozen ranked-title post keeps its title, poster and tier after the author un-ranks it entirely.

### 2. The direction nobody asked about — moderation

Given equal weight, and checked for the state that did not exist before this change: a card that has **already been detached**.

| subject blocked | result |
|---|---|
| `custom_item`, already detached | **VERIFIED gone** from the published post — *"a blocked card disappears from the published post even though it is no longer on any board"* |
| `custom_item`, still on the board | **VERIFIED gone**, unchanged from before |
| `custom_tier_row` | **VERIFIED gone** from the live board. Published posts never showed tier pictures, so there is nothing to check on that side — stated rather than pretended |
| `custom_list` | **VERIFIED gone** — blocking the board makes the whole publication unreadable |
| board under review | **VERIFIED refused** — its owner cannot remove cards from it |
| direct delete by a client | **VERIFIED refused** — `insufficient_privilege` |

### 3. Ordinary tier-list posts

Confirmed before treating as low-risk, as instructed: **no per-title moderation path exists.** `is_blocked` is never called for `ranked_titles` (CODE VERIFIED — no such subject type anywhere). The only lever is the author's whole-profile `is_public` flag from 004, which gates the entire post regardless of snapshot contents. So freezing name, poster and date takes no takedown lever away.

Channels got the same treatment: not named in the brief, but `resolveSnapshotChannels` is the same function for the same problem, and leaving it live would have made YouTube posts behave differently from every other kind for no stated reason.

## Posts published before this ships

**They keep behaving exactly as they do today**, and cannot be upgraded in place.

- Custom boards: their cards were never detached, so nothing changes. If a card is deleted from now on it will be detached, so *older* posts benefit too — the mechanism is not generational on this side.
- Ranked-title and channel posts: their snapshots carry placement only. `resolveSnapshotTitles` treats the presence of `title` as the marker for the new generation; without it, the old path runs unchanged, including dropping a title the author has since un-ranked. A snapshot is never rewritten — 014 has no UPDATE policy and a self-check that fails if one appears — so an old post **cannot** grow the new fields. It stays on the old behaviour until its author deletes it and publishes again. The same generational boundary 013 and 014 drew for their own predecessors.

A test pins this explicitly, including a mixed snapshot, so the rule is per entry rather than assumed uniform.

## The immutability invariant

Untouched and re-checked. 013's and 014's self-checks pass unmodified, and 029 restates the assertion itself: if any UPDATE policy ever appears on `custom_list_publications`, the migration fails. 029 adds three more — a client cannot delete cards, cannot write `detached_at`, and the new functions are `authenticated`-only.

## Tests

| check | result |
|---|---|
| local Postgres harness, normal | **exit 0, 115 assertions** (was 105 — 10 new) |
| harness `--fresh` | every migration applies to an empty database, 029 included |
| `npm test` | **1474 passed**, 118 files (was 1467) |
| typecheck / lint / build | clean · clean (1 pre-existing warning) · clean |
| `npx playwright test` | 15 passed |

**Rewritten rather than re-passed, as expected** — these asserted the behaviour just reversed:

- `11_publication_checks.sql` — "the snapshot is unchanged by deleting…" now removes the card through `remove_custom_item` and asserts it comes back `detached` with its row intact. Its header records which of its two promises changed.
- `custom-storage-cleanup.test.ts` — the fake client learned both new functions; the delete-order assertion now names the RPC. Two tests added for the kept-file case.
- `feed-snapshots.test.ts` — asserted the snapshot contained **no** `title`/`posterPath`; now asserts it does, with the reason.
- `custom-board-fork.test.ts` — mock chain taught `.is()`.
- `e2e/custom-board-clear.spec.ts` — stubbed a `DELETE` that no longer happens; now stubs the RPC.

**New:** `25_frozen_publication_checks.sql` (10 assertions) and a frozen-generation block in `feed-post-preview.test.ts` (5 tests).

**Negative controls — run, then reverted:**

- Made `remove_custom_item` delete instead of detach: the harness failed with *"the published card is gone from the table, so its picture cannot survive"*.
- Removed the `is_blocked` clause from the card policy: the existing exploit check failed with *"EXPLOIT 2 SUCCEEDED: a blocked card is still readable by its owner"* — the moderation path is guarded by a test that fires before any of mine.

## Remaining risks

- **UNKNOWN**: nothing here has run against production. Migration 029 is written and passes locally in both harness modes; applying it is a separate, deliberate step.
- A detached card whose post is later deleted stays detached forever — the publication cascades away and nothing sweeps the row. Costs one row and one file per case, no correctness issue. Deliberately not built: a sweeper that deletes storage on a schedule is exactly the kind of thing that should be added with its own tests, not slipped into a reversal.
- **INFERRED**: that hiding remaining a takedown lever is what Denis wants. It is the reading that keeps an author able to retract their own content, and it is called out here rather than buried so it can be overruled cheaply.
