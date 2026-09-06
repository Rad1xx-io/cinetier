# Battle and OBS-widget audit — "something doesn't add up"

Requested without a specific bug: a general sense that battle scoring or the OBS widgets don't add up somewhere. This is the same standard as `sql-audit.md` — code read plus real data where real data exists, VERIFIED/CODE VERIFIED/INFERRED/UNKNOWN throughout, and a plain "not confirmed" where a suspicion didn't hold up rather than silence.

Evidence vocabulary: **VERIFIED** (checked against a running app and/or real production data) · **CODE VERIFIED** (read completely, traced end to end, no live instrument) · **INFERRED** · **UNKNOWN/BLOCKED**.

**How live data was reached.** The Supabase MCP connection has been down all session (`ECONNRESET` on `mcp.supabase.com`; the project's REST endpoint itself answers fine, so this is the same MCP-transport failure noted earlier this session, not a new one). Direct SQL against production was not available. Two things stood in for it: `npm run dev` against the real, live Supabase project (`.env.local` points at production, not a local stub), driven through the actual site in a browser; and read-only anonymous REST calls with the public `anon` key already shipped in the client bundle — the same access any visitor's browser has, nothing wider. Anything gated behind sign-in (a specific account's own battles, PostHog's dashboard) was out of reach: I have no password for any real account, and creating a throwaway account to get one is off the table by policy regardless of who asks. Marked **BLOCKED** below rather than guessed at.

## Lead finding — a games id collision the code already half-documents

**CODE VERIFIED, real and reachable through normal use; not yet confirmed to have actually corrupted a specific real row.**

`lib/games/source.ts` runs the games catalog off IGDB when configured, Steam otherwise, and `activeGamesSource()` currently returns `"igdb"` live (confirmed against real stored ids, below). Its own comment on `getGameDetails` says plainly:

> Ids saved into a tier list before the switch are Steam appids, and IGDB ids are unrelated numbers … **The two id spaces do overlap numerically**, so a legacy entry can in principle resolve to a different IGDB game; that is the trade for keeping existing lists openable.

That trade was written for one lookup path — resolving a game's details page. It is not contained there. The exact same bare number (`RankedTitle.tmdbId`, no accompanying source tag anywhere in the schema) is what identifies a ranked game everywhere else in the app:

- **The database itself.** `supabase/schema.sql:18`: `unique (user_id, tmdb_id, media_type)`. For one user, `(tmdb_id, media_type)` is assumed to name one game.
- **Cloud sync.** `lib/storage/cloud-sync.ts:96`: `.upsert(rows, { onConflict: "user_id,tmdb_id,media_type" })`. If a game ranked years ago under a Steam appid shares that same number with a game later ranked under its IGDB id, the second upsert **overwrites the first row in place** — title, poster, tier, everything — with no error, no warning, nothing logged. The original ranking doesn't fail to save; it silently becomes a different game.
- **Battles.** `lib/battle/pool.ts:62-63`: `battleItemId(title) = "${title.mediaType}-${title.tmdbId}"`. `toCreatorRatings` (line 194-197) builds a plain object keyed by that id — a second candidate with the same id simply overwrites the first key, so one of two visually distinct games in the creator's rating pass silently vanishes from `creator_ratings` before the battle is even created.
- **The widget's own render.** `components/widgets/widget-tier-list.tsx:128` uses the identical `${title.mediaType}-${title.tmdbId}` as the React list `key`. Two colliding items in the same tier row would hand React a duplicate key.

Live values checked (`owner`'s real 22-game board, fetched read-only over the anon REST API): `tmdb_id` 71, 72, 122, 233, 472, 495, 529, 732 for Portal, Portal 2, Left 4 Dead, Half-Life 2, Skyrim, Metro 2033, Far Cry 3, GTA: San Andreas. These are small numbers — and that is exactly the range where the risk is concrete rather than theoretical: real Steam appids for old, popular titles are frequently just as small (Half-Life is `70`, Half-Life 2 is `220`, Portal is `400`). The collision-prone range is precisely the range of classic, frequently-ranked games, not some obscure edge case.

**What was not established.** No `source` column exists anywhere to tell, after the fact, which provider a stored `tmdb_id` came from — so I could not check whether any of `owner`'s 22 real games has *already* silently overwritten an older one. That question may be unanswerable retroactively at all without an audit log that doesn't exist. This is a genuine "found something more explicit than what was on the list" result, per the standing instruction to lead with it rather than the original checklist. No code was changed for this — this is a report, same as the SQL audit was before migration 030 followed it as a separate, explicit ask.

## B1 — participant result vs. `battle_participants` row vs. the owner's view

**BLOCKED on live data; CODE VERIFIED as far as reading goes.**

Completing this the way it was asked — play a real battle, then read back the same row as both anonymous participant and signed-in creator — needs an authenticated account on both ends. `getBattleParticipants`'s RLS (migration 006) restricts reads to `auth.uid() = user_id` or the battle's own `creator_id`; there is no capability-link fallback for an anonymous view. I have no password for the real account (`den4ik6447@gmail.com`), and creating a fresh throwaway account to close this loop myself is a prohibited action regardless of who authorizes it — stated plainly rather than worked around. No existing real battle link was discoverable either (no battle button on a public profile; battles are created from one's own board).

What CODE VERIFIED does establish, end to end:

- `submitBattleResult` (`lib/supabase/battles.ts:116-145`) computes `calculateMatchScore` exactly once and uses that single result both for the on-screen comparison and the `battle_participants` insert — not two separate calculations that could drift.
- `calculateMatchScore` (`lib/battle/calculator.ts`) is a pure function: same two rating objects in, same `overallMatchPercentage` out, deterministically (ties in the highlight lists break on item id specifically so reloading never reshuffles them).
- The insert itself sends `match_score: comparison.overallMatchPercentage` — the identical number just shown to the participant, not a re-derived one.
- No trigger exists on `battle_participants` (checked the only migration that touches it, `006_taste_battles.sql`) that could mutate `match_score` after the fact.

So the three numbers cannot drift **by construction**, absent a bug in `calculateMatchScore` itself (none found — see below) or the insert simply failing (see the PostHog gap in B5, which is exactly this failure mode). **What remains open**: a genuine live 3-way read-back needs either the Supabase MCP connection restored (then this is a five-minute read-only check) or Denis playing one round himself and relaying the three numbers. Concrete ask, not a vague one — either works.

## B2a — leaderboard tie-break

**CODE VERIFIED: the concern is real.**

`getBattleParticipants` (`lib/supabase/battles.ts:179`): `.order("match_score", { ascending: false })` — no secondary sort key. `BattleOwnerView` (`components/battle/battle-owner-view.tsx:81`): `const best = entries?.[0]`, rendered with a trophy and "Best match — X%" as a single, exclusive winner.

Postgres gives no ordering guarantee among rows with an equal sort key when nothing else disambiguates them — which of several participants tied for the top score comes back first is unspecified and can differ between two reads of the same data. Concretely: two people finish a battle with the same top match_score, and the owner's dashboard could show either one as "Best match" — and which one that is could, in principle, change on a page reload, not because anything changed, but because nothing pins it down. Whether this has ever actually shown a different winner across reloads was not testable without a real tied pair in production and repeated reads (blocked, same as B1) — the finding is that the code permits it, confirmed by reading the query and the constraint (or absence of one) directly, not inferred from general Postgres folklore.

**Not a finding**: `calculateMatchScore`'s own internal tie-breaking (agreement/disagreement highlight lists) already sorts on item id as an explicit secondary key specifically to avoid this exact class of instability — the leaderboard query is the one place that pattern wasn't applied.

## B2b — `itemsRated` vs. what actually fed the match score

**VERIFIED structurally sound under the app's own UI, by tracing every relevant path — not the same as "guaranteed by a shared source of truth."**

The concern as raised: `getBattleParticipants` computes `itemsRated: Object.keys(row.ratings ?? {}).length` — a bare key-count off the participant's own stored JSON — while `calculateMatchScore`'s `sharedItemCount` (what actually sets the score's denominator, and what PostHog's `items_rated` reports) is the intersection of *both* sides' ratings, valid-tier values only. Different computations, different inputs, no shared function.

Traced why they still agree in practice:

1. `create-battle-modal.tsx`'s `handleOwnPassComplete`/`createFrom` builds `battle.items` and `creator_ratings` from the **same filtered array** (`finalSelection`) in the same call — the pool and the creator's ratings are the same keyset by construction, not by convention.
2. `battle-voting.tsx`'s rating UI is six fixed buttons (`S/A/B/C/D/F`) with no free-text path, and a skip **deletes** the key rather than storing a blank — so every key a participant's `ratings` object can ever contain is both (a) a member of the pool (which equals the creator's keyset per #1) and (b) a valid tier value.

Given both, `Object.keys(participantRatings).length` and `sharedItemCount` are mathematically forced to the same number through the app's actual UI, every time. This is a real result, not a shrug — but it is worth being precise about what kind of guarantee it is: nothing in the type system or the database enforces "pool equals creator's keyset" as an invariant on its own; it holds only because `create-battle-modal.tsx` happens to build both from one array. A future edit-battle feature, or a second creation path, could break it without touching either `getBattleParticipants` or `calculateMatchScore` at all. Recorded as **VERIFIED: not a live discrepancy today**, with the fragility named rather than left implicit.

## B3 — widget completeness across content types

**VERIFIED against a real, live, 71-item account (`owner`) spanning Films, Games, Anime and YouTube.** No TV-only or Custom-board public account existed to check (production has exactly two public boards with real content right now: `owner`, 71 items, and `creator`, 18 Film-only items — the state of a young product, not a gap in the check).

Method: read `owner`'s real `/u/owner` page and the real `/widgets/tier-list/owner` widget side by side, via the accessibility tree rather than extracted text (a first pass under-read the widget because its content is poster images with alt text, not paragraph text — worth a screenshot-or-tree check, not a text-only one, when auditing anything poster-heavy). Both list all 71 items, in identical tier assignment, identical order within each tier, identical per-tier counts (S:5, A:19, B:14, C:17, D:14, F:2 — sums to 71 on both sides).

**One confirmed, deliberate difference, not previously on the list — worth naming rather than silently accepting.** `/u/[username]` (`public-tier-list-view.tsx`) iterates `TIER_ORDER` — S/A/B/C/D/F **plus Unrated** — and shows an Unrated section when populated (seen live: a second real account, `rad1xx`/"Niko ko", has one Unrated title, and its real profile page shows it). `WidgetTierList`'s `buildRows` (`components/widgets/widget-tier-list.tsx:31`) iterates `TIERS` only — the six rated tiers, Unrated categorically excluded, by the loop itself rather than an accident. Reasonable for a stream overlay (a backlog has no reason to be on a broadcast), and not flagged as a bug — but it is a genuine, live-confirmable content difference between the public page and the widget for the same account, which is exactly what B3 asked to compare. Naming it rather than treating "the widget renders a subset by design" as equivalent to "the widget renders everything."

**The two query implementations (`getPublicTierList` client-side, `getPublicTierListServer` server-side) — checked as a structural risk, cleared.** Compared field by field: identical `select` column lists on `profiles`/`ranked_titles`/`ranked_channels`/`criteria_scores`, identical `.eq("user_id", …)` filters, identical row-mapping logic (`fromRow` and the server's inline equivalent build the exact same shape, share the same `safeDonationUrl` helper). **VERIFIED: no divergence** — the doc comment's claim ("same query, same row mapping, same output shape") holds under direct comparison, not just on trust.

### B3b — `tmdbId` for games specifically

Covered above under the lead finding — the comment's silence on where a game's numeric id comes from is not an oversight to shrug off, it is a real, live, two-source ambiguity, unlike the movie/tv (TMDB) and anime (AniList) cases the same comment does name correctly.

## B4 — embed dialog vs. what the widget actually renders

**VERIFIED.** `parseWidgetParams`'s `limit` clamp uses `TIER_ORDER.length` (7, includes Unrated) while the embed dialog's number input caps at `max={6}` — confirmed harmless by reading the consumer, not just asserted: `buildRows` (`widget-tier-list.tsx:44`) stops at `rows.length >= limit`, and `rows` can never exceed 6 entries because the row loop itself only ever iterates `TIERS` (6). A `limit` of 7 is unreachable in practice; the mismatch is cosmetic, confirmed rather than assumed.

Checked the wider question this was standing in for — other places `TIER_ORDER` (7) and `TIERS` (6) could be crossed less harmlessly — by reading every usage of both across the codebase. The split is clean and intentional everywhere: `TIER_ORDER` for a person's own editable board and detail-page "add to tier" menus (Unrated is a real, legitimate bucket there); `TIERS` for anything already-rated-only — battle pools, the OG share banner, dashboard stats, the widget. No stray indexing or off-by-one found.

**Preview vs. real OBS URL: VERIFIED identical, not inferred.** `WidgetEmbedDialog` builds one `url` (`buildWidgetUrl(...)`, line 44) and uses that same variable for both the copy field and the preview `<iframe src={url}>` (line 189) — one value, two consumers, not two implementations that could drift apart. The dialog itself couldn't be reached live (it renders from a signed-in user's own board; same auth limits as B1), but there is no code path by which the preview and the pasted OBS link could differ — they are, textually, the same string.

## B5 — analytics funnels

**Partially BLOCKED.** Only the public, write-only `phc_...` client key exists in this environment (`.env.local`) — there is no PostHog personal/read API key available to query the dashboard's actual funnel numbers, and that dashboard itself needs a sign-in this session doesn't have. What follows is CODE VERIFIED instrumentation behavior, not measured funnel counts.

**A real, confirmed asymmetry — matches the suspicion exactly.** `submitBattleResult` (`lib/supabase/battles.ts:116-145`) fires `trackEvent("battle_completed", …)` unconditionally after computing the comparison, regardless of whether the `battle_participants` insert immediately above it succeeded — and unlike its siblings elsewhere in the codebase (`pushCloudTitles`, `pullCloudTitles`, both of which `console.error` on failure), **the insert's result is not checked at all, not even logged.** A dropped insert is currently invisible everywhere except as a gap between PostHog's `battle_completed` count and `battle_participants`' real row count for the same period — exactly the comparison Denis proposed, and exactly why it would need to be run rather than assumed clean. Not fixed here (out of scope for an audit-only pass) but concrete enough to act on directly: at minimum, log the insert error the same way its siblings do, so a real failure stops being silent even before anyone runs the funnel comparison.

**`trackWidgetViewed`'s `reportedRef` — works exactly as commented, which may not be what the dashboard number is read as.** `useRef(false)` in `WidgetTierList` (`components/widgets/widget-tier-list.tsx:52,71-74`) only survives across re-renders of one mounted instance — it cannot and does not claim to survive a full page reload, and the comment says so precisely ("Once per browser-source load," not "once ever"). An OBS Browser Source reload (scene switch with "Refresh browser when scene becomes active," a manual cache refresh, OBS restarting) is a full reload, a fresh JS context, a fresh `false`. So `widget_viewed` legitimately fires once per real load of the source — which could be several times an hour on an active stream. This is not a bug; it is a precise, honest measurement of "loads," and the only risk is a mismatch between that and whatever the number is assumed to mean when read off a dashboard (e.g., mistaking it for "unique stream sessions"). Worth confirming which interpretation the PostHog side expects, not worth changing in code.

`battle_started`/`battle_completed` firing logic (`components/battle/battle-view.tsx:41-62`) is clean: `startedRef` correctly guards against Strict Mode's double-invoke and re-renders, fires only once the pool is confirmed loaded (not on a dead link), and `battle_completed` fires from exactly one call site (inside `submitBattleResult`), so it cannot double-count on its own.

## Checked and cleared — worth stating, not just implying

| surface | result |
|---|---|
| `battles.category` missing `youtube` in the CHECK constraint | **false alarm, CODE VERIFIED.** True of migration `006` read alone; migration `007` (same day) drops and replaces the constraint with all four categories. Reading one migration file in isolation without its immediate follow-up would have reported a bug that was already fixed before it shipped. |
| client/server public-tier-list query divergence | **VERIFIED: none found.** See B3 above — identical column lists, filters, and row mapping, compared line by line. |
| `itemsRated` vs. `sharedItemCount` | **VERIFIED: not a live discrepancy today.** See B2b — structurally forced equal by the current creation+voting UI, though not by a shared source of truth. |
| widget params `TIER_ORDER`/`TIERS` (7 vs 6) mismatch | **VERIFIED harmless.** See B4 — unreachable in the row-building loop. |
| embed dialog preview vs. real OBS link | **VERIFIED identical** — same `url` variable, not two implementations. |
| `battle_started`/`battle_completed` double-fire risk | **VERIFIED: guarded correctly**, see B5. |

## Found in passing, out of scope for this audit — reported, not fixed here

While driving the local dev server against real data for this audit, the browser console repeatedly logged React's `"The result of getServerSnapshot should be cached to avoid an infinite loop"` from `SyncStatusBanner`. Root cause read and confirmed: `lib/storage/sync-status.ts`'s `getServerSyncStatus()` returns a fresh object literal on every call instead of a stable module-level reference, which is exactly what `useSyncExternalStore`'s `getServerSnapshot` contract forbids. Unrelated to battles or widgets — flagged separately (a queued follow-up task in this session, not part of either PR from this task) rather than folded in here.

## What would close the remaining gaps

Same two blockers as the rest of this session, named plainly rather than worked around:

1. **Supabase MCP connection** (`ECONNRESET` on `mcp.supabase.com`, unchanged all session) — once back, B1's full live 3-way check and a retroactive scan for any `ranked_titles` row that might already show signs of the games-id collision (e.g., a title/poster that doesn't match what its `tmdb_id` would resolve to today) become a direct, read-only query instead of a blocked item.
2. **A real account to play through, or PostHog dashboard access** — either Denis relaying two or three concrete numbers (a battle he plays himself: on-screen result, `battle_participants` row, owner-view display; and a glance at the `battle_started`/`battle_completed`/`battle_participants` counts for a real period) closes B1 and the live half of B5 without needing new access granted to this session.

No code was changed for this audit. The one finding concrete enough to justify a fix on its own — the games id collision — is deliberately left for Denis to decide on, the same way `sql-audit.md`'s findings waited for an explicit follow-up before migration 030 acted on them.
