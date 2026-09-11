# Four small, independent cleanups from the 2026-09-08 403/CORS audit, plus one date typo

Each checked and verified on its own — not one combined claim for all four.

Evidence vocabulary: **VERIFIED** (measured here, right now) · **CODE VERIFIED** (read, no runtime instrument) · **INFERRED** · **UNKNOWN**.

## 1. Anime routes were silent below status 500

**The gap, CODE VERIFIED.** `app/api/anime/genres/route.ts` and `search/route.ts` — plus `details/route.ts`, a third file with the identical pattern, found by checking the actual paths rather than trusting the two named from memory — only called `console.error` when `status >= 500`. AniList's real self-disable during the 2026-09-08 outage answered 403, which is `< 500`: the whole incident left nothing in the logs, which is exactly what that audit found.

**Fixed: logging is now unconditional.** Reaching the `catch` block at all means the source failed one way or another (an `AnimeSourceError`, any status) or this app has a bug of its own (falls back to `status = 500`) — both are worth a trace, so the status gate is gone rather than widened.

**The client message now distinguishes a source failure from our own bug**, not just two — three outcomes: `AnimeSourceError` at 429/503 still passes through the source's own actionable text (unchanged); `AnimeSourceError` at any other status (this is where the silent 403 lived, plus 502/400, previously lumped under the same bare "could not load") now says the data source is unavailable; anything that is not an `AnimeSourceError` (a real bug here) keeps the original generic message, because that is not a source failure. `details/route.ts`'s early 404 return (the requested id genuinely doesn't exist on either catalogue) was left exactly as-is — that is the source answering, not failing, and it never hid an incident.

**New test file, since none existed for these routes at all** — `__tests__/anime-routes-source-failure.test.ts`, 7 cases: a 403 now logs and shows the new message; a 429 still logs (it didn't before either) and still passes the real AniList text through; a genuine bug (not an `AnimeSourceError`) still logs with the original message; a real 404 logs nothing and isn't confused with a source failure.

## 2. `IMAGE_HOSTS` added to `connect-src` (still report-only)

**The gap, from the same 2026-09-08 audit, not re-derived here.** `img-src` already listed every image CDN; `connect-src` — which actually governs `fetch()`, the mechanism "Download PNG" uses to inline every cover — didn't. Harmless today only because the whole policy ships `Content-Security-Policy-Report-Only`; the day `connect-src` is ever enforced without this, every export with a non-Supabase cover breaks immediately, and the browser's own CSP violation reads exactly like a CORS failure to whoever debugs it next.

**Fixed:** `...IMAGE_HOSTS` spread into the same array that already builds `connect`, with the reasoning left in place as a comment. `ENFORCED_CSP_DIRECTIVES` (`object-src`/`base-uri`/`form-action`/`frame-ancestors`) is a wholly separate constant and function — untouched.

**Verified live, not just read back from source:**

| check | result |
|---|---|
| enforced `Content-Security-Policy` header, `curl` against `/` | identical to before: `object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` |
| report-only header | now carries `connect-src` with all nine hosts, matching `img-src` |
| live `fetch()` to `image.tmdb.org` from a real tab, `cache: "reload"` | succeeds, `200`, `type: "cors"` |
| console, same fetch | **no CSP violation logged at all** — before this fix the identical fetch produced "violates connect-src... report-only, logged but no action taken" (seen repeatedly during the 08.09 audit); its absence now is what confirms the browser is actually applying the updated header, not just that it's present in the HTTP response |

## 3. Two stale comments

- **`lib/utils/board-export.ts`'s `includeQueryParams` comment** described the pre-2026-08-31 world (`/_next/image`, "differ only in the query"). Since `remotePatterns` was emptied that day, every cover is a direct request to its own CDN — a different path on a different host, never a shared path with a different query. Rewritten to say so, and honest about what that means: the specific cache-key collision the comment used to justify (same path, different query, stripped by the library's default cache key) can no longer happen through `/_next/image`, because nothing goes through it. Left the setting itself **on** — costs nothing today, and is the cheap insurance against a future host that does put an image's identity in its query string. Changing the setting itself was not asked for and wasn't done.
- **`lib/utils/image-source.ts`'s `DIRECT_HOSTS` comment** said "the four hosts below" — there are nine now (Steam's three, YouTube's two, TMDB/IGDB/AniList/MAL). Reworded without a count, so adding a host doesn't require remembering to touch this comment too.

## 4. Date typo in `.ai/DECISIONS.md`

**VERIFIED against git history, not guessed.** The migration-031-applied entry was headed `2026-09-10`. The actual commit (`4be4a12`, "Apply migration 031 to production") is dated `2026-09-08 23:14:47 +0200`, the same evening as PR #83. Corrected to `2026-09-08` — the file's entries read newest-first, and this restores that order against its neighbors (09-08, then 09-06).

## Found nearby, deliberately not touched

`lib/utils/export-error.ts`'s `describeExportFailure` carries the same stale "the board's covers arrive through Next's optimiser" framing as item 3 — confirmed still present, not from memory. Not in the four items asked for; recorded in `.ai/DECISIONS.md` as an honest aside rather than fixed here.

## Verification

| check | result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean (1 pre-existing warning, unrelated line) |
| `npm run build` | clean |
| `npm test` | **1487 passed** (was 1480 — 7 new, all in the new anime-routes test file) |
| CSP, live | see table in item 2 |

## Also this session: why Supabase MCP kept dropping, and the anime-source id fix (PR #85)

Two separate pieces of work landed between this report's first version and its merge into `main`, each with its own full record in `.ai/DECISIONS.md` rather than repeated here:

- **The recurring `ECONNRESET` on the Supabase MCP connection** was traced to a live, unresolved Supabase platform incident ("Unresponsive Projects," started 2026-09-10, affects Database, Nano-tier projects) — not a token problem, not local network. 2026-09-11 entry.
- **PR #85** (anime id-source label, migration 032) was merged, and turned out to have been sitting unmerged while its migration was already live on production — meaning the deployed app was still writing `source = 'native'` for anime against a constraint that no longer accepted it. Confirmed live (`CHECK_VIOLATION` on the exact row shape the deployed code sent) before the merge, and confirmed fixed after. 2026-09-11 entry, "исчезло из репозитория" / active-bug thread.
