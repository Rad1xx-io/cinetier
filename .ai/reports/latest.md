# Server-render /feed and /u/[username]

## The bug, confirmed by reading code, not guessed

Google Search Console listed 21 pages outside the index, and not only
`/title/movie-…` cards — `/feed`, `/tier-list`, and `/u/<username>` were on
it too. For the first two, the cause was in the code: `app/feed/page.tsx`
rendered `<FeedView/>` and `app/u/[username]/page.tsx` rendered
`<PublicTierListView/>`, both 100% `"use client"`, both fetching everything
inside a `useEffect` through `getSupabaseBrowserClient()`. The server's own
HTML never contained a real post or a real board — only the header, the
tabs, and an empty `Skeleton`. Not an RLS problem: `posts`/`post_likes`/
`post_comments` (migration 009) and public `profiles`/`ranked_titles`
(migration 004/021) already read fine through the anonymous key — the fetch
was simply happening in the wrong place, one render too late for a crawler
that does not run JavaScript.

`/tier-list` is deliberately untouched — it is a signed-in visitor's own
board editor, not public content shared with strangers, and whether it
should stay as-is, get an explicit `robots: {index:false}` the way
`/custom/[id]` already does, or grow a separate marketing landing for
signed-out visitors at that URL is a product call, not mine to make.

## The pattern already existed in this codebase — reused, not invented

`app/custom/[id]/page.tsx` and `app/title/[id]/page.tsx` already do this
correctly: an `async` Server Component fetches before render and hands the
result to a client component as a prop. Both `/feed` and `/u/[username]`
now follow the same shape:

- **`lib/supabase/public-read.ts`** — already the app's one existing
  session-less, server-only Supabase module (built for the sitemap) — grew
  two new exports: `getPublicTierListServer(username)` and
  `getInitialFeed(limit)`.
- **`app/u/[username]/page.tsx`** and **`app/feed/page.tsx`** became `async`
  Server Components, calling those and passing the result down as
  `initialData` / `initialPosts`.
- **`PublicTierListView`** and **`FeedView`** render that prop immediately —
  no "loading" on the first frame — and keep their existing `useEffect`
  fetch as an unchanged fallback for whatever the server didn't have (client
  not configured, profile missing/private, a transient failure). When the
  server *did* have data, the effect's only remaining job is firing the
  "viewed shared content" analytics event once — the fetch itself is
  skipped entirely.

## A "use client" module's exports don't cross into server code — only its types do

`lib/supabase/profiles.ts` and `lib/supabase/feed.ts` both carry a
`"use client"` directive. Next replaces a client module's *runtime* exports
with client references the moment server code imports them, so calling
`getPublicTierList()` or `getFeed()` directly from a Server Component fails
at runtime — that was never on the table. Types are erased before either
bundle exists, so importing `PublicTierList`, `FeedPost`, and `PostCategory`
as types is safe and is exactly what lets the new server functions return
data shaped identically to what the client components already expected —
neither component needed its prop types rewritten. The actual queries and
row-mapping, though, are honestly duplicated against the same session-less
client every other function in `public-read.ts` already uses, not imported
— matching a pattern already established in that same file (its own
`ProfileRow`/mapping for the sitemap, independent of `profiles.ts`'s).
Small module-level constants (`FEED_CATEGORIES`, the feed page size) are
duplicated the same way and for the same reason.

## `/feed` would have baked its content into the build forever, without one more line

`next build` prerenders any route with no dynamic API in sight and no
`[parameter]` segment. `/feed` is exactly that: no `cookies()`, no
`headers()`, a session-less client — the identical combination that already
makes the sitemap safely static. For a live community feed that is the
wrong default: without an explicit opt-out, the page's HTML would have been
generated once at `npm run build` and never updated again short of a new
deploy, no matter how many posts got published afterward. Caught by reading
the build output itself: `/feed` printed as `○` (static) right after the
first version of this change, before anyone noticed anything was wrong in a
browser. Fixed with `export const dynamic = "force-dynamic";` — the same
opt-out `app/discover/page.tsx` and `app/games/page.tsx` already use, for a
related reason (`useSearchParams` there instead). `/u/[username]` never had
this problem: its `[username]` segment, with no `generateStaticParams`,
already makes Next render it on demand — confirmed `ƒ` in the build output
both before and after this task.

## Enrichment queries stay client-side, on purpose, even for server-provided posts

`getAuthorTitles`, `getAuthorChannels`, `getMyLikes`, `getPublishedBoards`,
and `getPostSnapshots` were left exactly where they were — client-side,
after mount — even for the posts the server now provides. None of them are
what a crawler needed: the post's own title and author are already in the
server HTML the moment `getInitialFeed` runs; likes counts and board
previews are decoration on a card that's already there, not the reason
Search Console flagged this page. Doing a second server round trip for
that would have been complexity this bug didn't ask for.

`FeedView` tracks whether it has already consumed the server's snapshot
with a `useRef`, not a prop comparison: switching to another tab and back
to "All" fetches a fresh page through the ordinary client `getFeed({})`
rather than re-showing the frozen build-time (well, now request-time) copy
forever.

## Duplicate handling for a profile that can be *readable* without being *public*

Not a new fact this task discovered — already on record from the same day's
earlier Fork entry — but directly load-bearing here: `profiles`' RLS
(migration 021) is `is_public OR own OR exists posts`, so the anonymous
client can get a profile row back even when `is_public = false`, if that
account has ever posted (so the feed can still show a byline). Both the
client `getPublicTierList` and the new `getPublicTierListServer` explicitly
re-check `profile.isPublic` in application code after the row comes back —
that check, not the database, is what keeps a private board off
`/u/[username]` through this same anonymous client. Replicated exactly,
not reinvented.

## What's new

- **`lib/supabase/public-read.ts`** — `getPublicTierListServer(username)`,
  `getInitialFeed(limit?)`, plus the row interfaces and mapping each needs.
- **`app/u/[username]/page.tsx`** — fetches server-side, passes
  `initialData` to `<PublicTierListView>`. `generateMetadata` untouched.
- **`components/public-tier-list/public-tier-list-view.tsx`** — takes
  `initialData: PublicTierList | null`; renders it immediately when
  present, falls back to the original client fetch when not.
- **`app/feed/page.tsx`** — fetches server-side via `getInitialFeed()`,
  passes `initialPosts` to `<FeedView>`; `export const dynamic =
  "force-dynamic"`.
- **`components/feed/feed-view.tsx`** — takes `initialPosts?: FeedPost[]`;
  renders it immediately for the "All" tab's first mount only, tracked by a
  `useRef` so a later return to "All" re-fetches instead of reusing it.

## Tests

- **`__tests__/public-profiles.test.ts`** (extended) — 10 new cases across
  `getPublicTierListServer` (profile + titles + channels + criteria scores
  in one read, username lower-cased before the lookup, `null` and zero
  extra queries for a non-public profile even when RLS hands back its row,
  `null` for no match, `null` when Supabase isn't configured) and
  `getInitialFeed` (shape matches `FeedPost` exactly, category
  normalisation to `"mixed"`, a smaller page size, `null` — not `[]` — on a
  failed read so the caller can fall back rather than show a false "empty",
  `null` when not configured).
- **`__tests__/public-tier-list-view.test.tsx`** (new, 5 tests) — renders
  server data immediately with no client fetch; fires the viewed-content
  event exactly once; falls back to the client fetch and its existing
  success/failure states when the server had nothing.
- **`__tests__/feed-initial-posts.test.tsx`** (new, 6 tests) — renders
  server posts immediately with no `getFeed` call; still runs every
  enrichment query against them; shows the real empty state (not a
  skeleton) for a confirmed-empty server feed; switching tabs and back to
  "All" still hits `getFeed` fresh; the no-`initialPosts` case is
  unchanged from before this task.
- Both new component test files were verified with a negative control:
  removing the `if (initialData)`/`useInitial` short-circuit in each
  component made the tests that depend on it fail (2 of 5, and 5 of 6,
  respectively) before the fix was restored.
- `__tests__/feed-custom-tab.test.tsx` (pre-existing, unmodified) still
  passes unchanged — it renders `<FeedView />` with no `initialPosts`,
  exactly the fallback path this task had to leave alone.

## Verified in raw HTML, not just in tests

Built (`npm run build`) and served the production output on a spare port,
then read the response with `curl` — no JavaScript executed:

- **`/feed`**: 2 real `<article>` post cards in the raw response, real
  author links (`/u/creator`, `/u/owner`), real titles ("Best Anime 2026",
  "Best movies of 2026"), zero occurrences of the loading-skeleton markup.
- **`/u/owner`**: the real display name ("Rad1xx") and real ranked titles
  ("Elden Ring", "Frieren: Beyond Journey's End Season 2", "God of War", …)
  in the raw HTML; no "Tier list not found" text.
- **`/u/<a genuinely nonexistent username>`**: still 200, still the correct
  per-username `<title>` from `generateMetadata`, still falls through to the
  pre-existing client-resolved "not found" state — unchanged from before
  this task, confirming the fallback path works for a real nonexistent user
  and not only in a mocked test.

## Verification

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing, unrelated warning) |
| `npm run typecheck` | clean |
| `npm test` | 1322 passed, 102 files (was 1301/100 before this task) |
| `npm run build` | clean — `/feed` now `ƒ` (was `○` before the `force-dynamic` fix), `/u/[username]` `ƒ` (unchanged) |
| `npx playwright test` | 15 passed — feed specs now take ~8s each instead of ~2-3s, expected once `/feed` does a real per-request Supabase round trip instead of a static/client render |
| Raw HTML via `curl` against a production build | `/feed` and `/u/owner` both carry real content; a nonexistent username still degrades correctly |

No migration in this task — every table read here (`posts`, `profiles`,
`ranked_titles`, `ranked_channels`, `criteria_scores`) and its RLS already
existed and already allowed anonymous reads; only where the read happened
changed.
