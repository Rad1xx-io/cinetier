# Anime gets the same id-source label games got in PR #81 — migration 032

Checked first whether this had already been started (it hadn't), then built it end to end: schema, every application call site the games fix touched, live production migration, and a real bug this caught locally before it ever reached production.

Evidence vocabulary: **VERIFIED** (measured here, right now) · **CODE VERIFIED** (read, no runtime instrument) · **INFERRED** · **UNKNOWN**.

## Step 1 — honest status check, before writing anything

**VERIFIED: nothing had been started.** Checked `git log --all`, every local and remote branch, open and closed PRs, `.ai/DECISIONS.md`, `.ai/reports/` — no trace. The one commit matching "anime" + "source" (`fdf6133`, Aug 16) is unrelated: it defaults the `ANIME_SOURCE` env var to AniList, not a per-row source label. `RankedTitle` had no `animeSource` field; no `AnimeSummary` field recorded which catalogue answered. Whatever report reached Denis each time really was the outage/CORS diagnosis, not this feature — confirmed by absence, not inferred.

## Step 2 — same class of problem as games, same fix shape

`lib/anime-sources/index.ts`'s own comment already named the risk: AniList ids and MyAnimeList/Jikan ids are two different, overlapping numbering schemes sharing one `tmdb_id` column. `jikan-adapter.ts`'s `mapJikanToSummary` goes further in its own comment — "Deliberately a MAL id in a field named for AniList" — confirming in code that the same bare id already means two different things depending on which catalogue answered, exactly the situation migration 031 closed for games. Production data measured 2026-09-08 (already recorded): ~17 anime rows across 3 users, most with ids well past AniList's original MyAnimeList-seeded range — the collision-risk zone.

**Schema decision, reasoned through rather than copy-pasted:** extends the same `source` column 031 added (not a second column — see `.ai/DECISIONS.md` for why a nullable second column reopens 031's own NOT-NULL trap), but the `ranked_titles_source_media_type_check` constraint is **rewritten**, not extended. 031's version was a single boolean (`(media_type = 'game') = (source <> 'native')`) — correct for two buckets, but a third ambiguous media type doesn't fit a two-way check: `'anilist'` would have satisfied `source <> 'native'` on a **game** row exactly as wrongly as on a real anime row, and the old constraint had no way to notice. Rewritten as one CASE per `media_type`. This is strictly stronger, not just wider: it now also rejects a game row claiming an anime source and vice versa — a class of mistake the old constraint could not express at all, proven directly (below).

**A real naming collision found and avoided, not walked into.** `AnimeDetails` already has a `source: string | null` field — MyAnimeList's own "source material" (manga, light novel, original…), an unrelated concept. `lib/anime-sources/anime-source.ts` also already exports an `AnimeSource` **interface** — the catalogue-implementation contract (search/getDetails/getGenres), a third, different shape. Naming the new id-provenance field `source` or `AnimeSource` would have collided with one or both. New type is `AnimeCatalogSource` (`lib/types/anime.ts`); the field on `AnimeSummary` is `catalogSource`; the existing `AnimeSourceId` (`lib/anime-sources/anime-source.ts`) becomes an alias of it, the same move `lib/games/source.ts` makes for `GamesSource = GameSource` — nothing already importing `AnimeSourceId` needed to change.

## Every place the games collision touched — checked, not assumed closed

Uniqueness constraint (unchanged — already written against `source` in general, verified by reading it rather than assuming), `cloud-sync.ts`'s upsert conflict key and `toSourceColumn`/`fromSourceColumn` (now media-type-aware for both game and anime), `battleItemId`, the widget's React key (delegates to `tierItemKey`, so nothing to touch there directly), `titleKey`, `tierItemKey`, `boardItemKey` (delegates too), `findRatingId`. Plus the full call chain those didn't name explicitly but that already carries `gameSource` for games: `local-storage-repository.ts`, `storage/index.ts`, `use-ranked-titles.ts`, `use-lazy-criteria.ts`, `criteria-section.tsx`, `fork.ts`, `validation.ts`, `tier-list-board.tsx`. New anime saves get `catalogSource` stamped at the mapper level (`lib/anilist/mappers.ts`, `jikan-adapter.ts`), mirroring `igdb/steam mappers.ts` exactly. `anime-details-view.tsx` rewritten to mirror `game-details-view.tsx` line for line (source-aware "already ranked" lookup, `addInput` helper, source threaded through remove/setTier/CriteriaSection).

## What is deliberately not fixed, and why — same discipline as 031

- **The 17 existing anime rows** — `source = 'unknown'`, not guessed at. No column ever recorded where they came from.
- **`rankedByKey` on the search/discover pages** (`games-discover-client.tsx`/`games-results-grid.tsx` and their anime equivalents) builds and reads `titleKey` with **no source argument at all** — an already-shipped gap in the games fix (PR #81), not something new. Left identical for both media types on purpose: fixing it only for anime would make games and anime behave differently for no reason. Cosmetic risk only (a search-results "already added" badge could mislight across catalogues), not a data-correctness issue.
- **`resolveSnapshotTitles`** (`lib/feed/post-preview.ts`) — same already-documented gap from the games fix (2026-09-06 entry), same reasoning (cosmetic: only affects a frozen post snapshot's secondary live fields).
- **`/anime/[id]`** resolves only through the currently active catalogue (`getAnimeSource().getDetails(id)`), with no cross-catalogue fallback — unlike `getGameDetails`, which tries IGDB then Steam. Updated the standing warning comment in `lib/anime-sources/index.ts`: the prerequisite it demanded (`RankedTitle` recording a source) is now done, but a safe source toggle still needs that fallback built first.
- Analytics event ids (`anime-${tmdbId}`, no source) — PostHog measurement only, same reasoning as games.

## A real bug, caught locally, never reached production

First version of the migration ran the backfill (`anime rows: 'native' → 'unknown'`) **before** replacing the constraints. Under 031's still-active constraint at that point, an anime row is *required* to stay `'native'` — the backfill was a violation of the very constraint it existed to correct data for. `apply_migration` against production failed on the first real attempt (`CHECK_VIOLATION` on an actual row — Jujutsu Kaisen), inside one transaction, rolled back cleanly — **verified separately**, with a follow-up query, before touching production again, not assumed. The local `--fresh` harness never caught this, because it builds from an empty database with no pre-existing anime rows for the backfill-then-constrain sequence to actually exercise. Reproduced by hand (rolled a local copy back to 031's constraint, inserted a real-shaped anime row at `source = 'native'`, reran the migration — same failure), fixed the ordering (drop constraints → backfill → add constraints, the same order 031 was naturally in by adding an unconstrained column first), reran — clean. Same investigative habit as the Portal/black-rectangle case this session: reproduce, don't guess.

## Before / after, production

| check | before | after |
|---|---|---|
| `ranked_titles_source_media_type_check` | `(media_type = 'game') = (source <> 'native')` | one `CASE` per `media_type` (movie/tv/game/anime) |
| `anime` rows | 17 × `source = 'native'` | 17 × `source = 'unknown'` |
| `game`/`movie` rows | unchanged | unchanged (34 igdb, 50 unknown, 22 native) |
| a game row inserted with `source = 'anilist'` | **accepted** — verified directly (`INSERT 0 1`) against the old constraint | rejected (`CHECK_VIOLATION`) |

The migration's own closing self-check ran inside `apply_migration` both times and would have rolled back the whole call on any violation — the second run's silence is itself part of the evidence, not merely "no error printed."

## Verification

| check | result |
|---|---|
| `npm run typecheck` | clean (one test fixture needed `catalogSource` added) |
| `npm run lint` | clean (1 pre-existing, unrelated warning) |
| `npm run build` | clean |
| `npm test` | **1480 passed** (two pre-existing exact-arity assertions updated for the new trailing parameter — not behavior changes) |
| local Postgres harness, default + `--fresh` + `--negative` | all green, including new `28_ranked_title_anime_source_checks.sql` |
| negative control on the new constraint specifically | reverted to 031's binary check, confirmed a game+`'anilist'` row is **accepted** under it, restored, confirmed rejected again |
| live browser check, real dev server, real production Supabase | see below |

**Live verification could not go through the actual search UI.** AniList is still down (403, the same 2026-09-08 outage, external, unrelated, not touched here) and Jikan's search/list endpoints were already found degraded that same day. Neither catalogue can serve a real "search and add" click right now, for reasons that have nothing to do with this change. What was verified instead, directly against the actual storage layer that changed: seeded two synthetic anime sharing `tmdbId: 16498` with `animeSource: "anilist"` / `"jikan"` into a running dev server's `localStorage`, reloaded — both rendered as **distinct cards** ("Attack on Titan (AniList)" in S, "A Different Anime (Jikan)" in A), no React duplicate-key warning, "Anime 2" in the category count. Changed the Jikan-sourced card's tier through the real UI (A → C) — only that card moved; the AniList one stayed in S, untouched. Read `localStorage` back afterward: both rows intact, correct tiers, `animeSource` preserved on both.

## Record

Full account, including the schema reasoning, the naming-collision avoidance, and the caught-before-shipping ordering bug, in `.ai/DECISIONS.md` (2026-09-10 entry), same before/after format as every other migration applied to production this project.
