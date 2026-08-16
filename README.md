# TierListOnline

Rank films, TV, anime, games and YouTube channels into tiers from S down to F,
then share the board, publish it to a community feed, or challenge a friend to
rate the same line-up and see how closely your taste matches.

**Live:** https://tierlistonline.com

The app is local-first. `localStorage` is the source of truth and everything
works without an account; signing in mirrors the board to Supabase so it follows
you between devices.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Data | Supabase — PostgreSQL with Row Level Security, Auth |
| Drag and drop | dnd-kit |
| Tests | Vitest + Testing Library (jsdom) |
| Hosting | Vercel, auto-deployed from `main` |

Catalogue data comes from TMDB (films and TV), AniList or Jikan/MyAnimeList
(anime), IGDB with a Steam fallback (games) and the YouTube Data API.

## Running locally

Requires **Node 20.9 or newer** (Next 16's floor).

```bash
git clone https://github.com/Rad1xx-io/cinetier.git
cd cinetier
npm install
cp .env.example .env.local   # then fill in the keys — see the table below
npm run dev
```

The app comes up on http://localhost:3000.

You do not need every key to start. With `.env.local` left empty the app runs in
guest mode: the tier list, drag and drop, export and import all work, and the
catalogues that need a key say so instead of breaking. Fill keys in as you need
the catalogue behind them.

### Supabase

Only needed for accounts, cloud sync, public profiles, the community feed and
Taste Battles. Create a project, then run the SQL in this order from the
dashboard's **SQL Editor → New query**:

1. `supabase/schema.sql` — base tables and their RLS policies
2. `supabase/migrations/002_add_anime_media_type.sql`
3. … through `011_public_profile_sitemap.sql`, in numeric order

Numbering starts at 002 because the initial schema lives in `schema.sql` rather
than as migration 001. Every migration is written to be safe to re-run, and each
one opens with a comment explaining what it changes and who can then read what.

There is no Supabase CLI setup in this repo — migrations have always been
applied by hand through the SQL Editor.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | for accounts | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for accounts | Supabase anon key. Safe in the browser — access is governed by RLS, not by keeping it secret |
| `TMDB_API_TOKEN` | for films/TV | TMDB v4 read token, server-only |
| `YOUTUBE_API_KEY` | for YouTube | YouTube Data API v3 key, server-only |
| `TWITCH_CLIENT_ID` | for games | IGDB is reached through Twitch credentials |
| `TWITCH_CLIENT_SECRET` | for games | Left blank, games fall back to the Steam store |
| `IGDB_ACCESS_TOKEN` | no | A pre-minted token instead of the id/secret exchange |
| `NEXT_PUBLIC_POSTHOG_KEY` | no | PostHog analytics; inert when blank |
| `NEXT_PUBLIC_POSTHOG_HOST` | no | PostHog host |
| `ANIME_SOURCE` | no | `anilist` (default) or `jikan` |
| `NEXT_PUBLIC_SITE_URL` | no | Origin for canonical URLs, Open Graph, sitemap and share links. Defaults to `https://tierlistonline.com` |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | no | Search Console token; the meta tag is omitted while unset |
| `NEXT_PUBLIC_*_AFFILIATE_ID` | no | Affiliate ids for outbound "where to watch" links |
| `ALLOW_LOCAL_IP_IMAGES` | local only | Set to `true` **only** on an IPv6-only/NAT64 network, where Next's image optimizer rejects every remote cover as a private address. Never set it in deployment |

Server-only keys must never gain a `NEXT_PUBLIC_` prefix — that would ship them
to the browser.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve a production build |
| `npm test` | Vitest, once |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

There is no CI yet, so run the last three before pushing — a red `main` still
deploys.

## Layout

```
app/            Routes, layouts and API route handlers; sitemap and robots
components/     UI, grouped by feature (tier-list, battle, feed, criteria, …)
lib/            Everything that is not a component:
                  analytics/      event layer and its providers
                  anime-sources/  AniList/Jikan adapters behind one interface
                  storage/        localStorage repositories and cloud sync
                  search/         query normalisation, aliases, fallbacks
                  supabase/       browser, server and anonymous clients
                  tmdb/ igdb/ steam/ youtube/ anilist/   catalogue clients
                  types/          shared shapes
supabase/       schema.sql and numbered migrations
__tests__/      Vitest suites
```

## Things worth knowing before you change something

**`localStorage` keys are prefixed `cinetier:` — do not rename them.** The
project was called CineTier before the rebrand. The prefix is invisible to
users, and renaming it would not be a rebrand but a wipe: every existing board
would vanish, because `localStorage` is the source of truth here. Moving them
needs a read-old/write-new migration, not a find-and-replace.

**The anime catalogue has two interchangeable sources.** `lib/anime-sources/`
puts AniList and Jikan behind one interface; `ANIME_SOURCE` picks. This exists
because AniList disabled its API for a stretch and took the whole tab with it.
Note that AniList ids and MyAnimeList ids are different numbering schemes, and
the id is stored in every user's board — read the comment above the factory in
`lib/anime-sources/index.ts` before exposing a per-user switch.

**The interface is English; some catalogue content is not.** TMDB and AniList
are queried in English, but titles saved to a board before that change keep the
language they were saved in, so existing boards hold a mix.

**Search accepts Russian input.** `lib/search/` transliterates, tolerates typos
and maps names the catalogues do not index (`lib/search/aliases.ts`) — a Russian
query returns a result named in English. Adding an alias is usually the fix when
a title cannot be found by its Russian name.

**Tests run entirely against mocks.** They will not catch an upstream API
changing its behaviour; both anime outages this year were found by users, not by
the suite.

## Deployment

Vercel, automatically on every push to `main`. Environment variables live in the
Vercel dashboard, not in the repo. Database migrations are **not** part of the
deploy — apply them in Supabase yourself, before shipping code that needs them.

---

`AGENTS.md` (and `CLAUDE.md`, which includes it) carries instructions for AI
coding agents, not for people. `next dev` rewrites that file, so leave it alone.
