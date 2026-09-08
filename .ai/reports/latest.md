# The black-rectangle export bug: not reproduced, so not guessed at — the gap that let it hide is closed instead

Denis's brief gave three candidate fixes, each tied to a specific cause. None of the three causes held up. Rather than pick one anyway, this went a fourth way: close the actual gap the investigation found — that a cover failing during export has never been visible to anyone, including now.

Evidence vocabulary: **VERIFIED** (measured here, right now) · **CODE VERIFIED** (read, no runtime instrument) · **INFERRED** · **UNKNOWN**.

## 1. Diagnosis

**Denis's own hypothesis (missing `Access-Control-Allow-Origin`) — VERIFIED false**, checked directly rather than by the general survey from the previous audit. Found the real, current Undertale entry live (IGDB search, appId 12517, poster `images.igdb.com/.../cob1t2.jpg`) and hit its exact URL with `curl -X GET` carrying `Origin: https://tierlistonline.com`: `Access-Control-Allow-Origin: *`, clean. The current games source is IGDB (VERIFIED — `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` are configured, `activeGamesSource()` picks IGDB whenever they are), so today's Undertale is not a Steam-vs-IGDB id collision either.

**The bug itself — could not be reproduced, after genuinely trying hard, not after a quick look.** In order:

- A guest board with only Undertale: exported clean.
- A guest board with Undertale plus 6 other real games (concurrent fetch, the scenario closest to "a normal board"): the first two attempts appeared to show exactly one flat-black card, every time, in the same position — which looked like a real, deterministic finding worth chasing. Standalone replays of the library's own fetch-and-decode step against that exact image succeeded outright; pre-embedding every cover as a data url on the live DOM *before* calling into the library (so its own fetch path never ran at all) still showed the same one black card; inspecting the raw SVG the library produced showed all 7 images correctly embedded as real, substantial JPEGs, Undertale's neighbor included. That last check is what turned up the actual explanation: **the "black card" was this investigation's own measurement error.** The card grid was sampled using an assumed even split of the row's width, and the real cards are fixed-width with a trailing gap the assumption didn't account for — the coordinates landed past the last real card, in genuinely-blank space that was never a bug. Measuring the same PNG with the cards' real, live `getBoundingClientRect()` positions instead of a guessed formula showed all 7 covers rendering correctly, including the one that had looked black. Re-run at 37 concurrent covers (twice) with the corrected measurement: zero failures both times.
- The image that had been flagged specifically (Portal, not Undertale, in these boards) was real texture all along — its poster is simply mostly black, which is what made the measurement error read as plausible instead of obviously wrong.

**What this rules out, and what it can't.** Every mechanism any of the three candidate fixes would address is confirmed either working or already fixed: CORS headers on every catalogue CDN (checked live with real URLs, not assumed from the general survey), and the previously-documented cache-poisoning bug (`cache: "reload"` in `boardSvgOptions()`) — reproduced on demand with the fix removed, confirmed gone with it in place. What it can't rule out: Denis's own board and browser, which this investigation never had access to. Undertale is genuinely not in the synced database under any account — **VERIFIED**, queried directly — so the exact `posterPath` his board actually holds, and whether it differs from what a fresh search returns today, is **UNKNOWN**. Nothing here was tested on Safari/WebKit either; this environment only has a Chromium-based browser available.

**Given that, applying any of the three candidate fixes now would be a guess with a real cost** — `crossOrigin="anonymous"` specifically carries the regression risk Denis's own brief already named (a cover that turns out to lack CORS support stops loading everywhere, not just in export), for a cause that isn't confirmed. None were applied.

## 2. What was done instead

The one concrete finding from all of this: **a cover that fails during export has never been visible to anyone.** `imagePlaceholder` exists so one bad fetch doesn't sink the whole board — the right call — but the cost is that `succeeded: true` fires whether every cover made it or not, and nothing short of downloading the PNG and looking at it (or, this time, several hours of pixel forensics) would ever say otherwise. That gap is real regardless of what actually caused Denis's black rectangle, and it's what made this bug so hard to chase in the first place.

**`renderBoardPng` ([board-export.ts](lib/utils/board-export.ts)) now returns `{ dataUrl, missingCovers }` instead of a bare string.** `missingCovers` counts exact occurrences of the placeholder's fixed data-url string in the SVG the library produces — the one point left where a placeholder is still distinguishable from a real (if mostly-black) cover; after rasterising to a canvas there is nothing left to search. `fetchRequestInit`, `imagePlaceholder`, `data-export-hide` — untouched, as asked.

Wired through all three places a board leaves as a PNG:
- **[tier-list-actions.tsx](components/tier-list/tier-list-actions.tsx)** and **[custom-board.tsx](components/custom-list/custom-board.tsx)**: the existing "Image saved" notice becomes "Image saved — N cover(s) could not be included" when `missingCovers > 0`.
- **[post-dialog.tsx](components/feed/post-dialog.tsx)** (a post downloaded from the feed): no existing success notice exists here to extend, and none was added — this only gets the analytics signal below. Noting the asymmetry rather than inventing new UI state for it.
- All three now pass `missingCovers` into `trackImageExported` ([events.ts](lib/analytics/events.ts)), sent as `missing_covers` and omitted entirely when zero, so the ordinary case's event shape is unchanged. If this happens again for a real visitor, it now leaves a PostHog record — board size, rough time, how many covers — instead of needing to be reconstructed by hand from a downloaded file.

## 3. Verification

| check | result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean (1 pre-existing warning, unrelated line) |
| `npm run build` | clean |
| `npm test` | **1480 passed** (was 1479 — 1 new) |
| live export, 37 real concurrent covers, in the browser | `{items_count: 38, succeeded: true}` — `missing_covers` correctly absent, not sent as `0` |

**New test, proving the counter itself rather than trusting the wiring** (`post-delete.test.tsx`, same "prove the detector detects" shape as this project's other self-checking tests): `renderBoardPng` mocked to resolve with `missingCovers: 1` → asserts `trackImageExported` is called with `missingCovers: 1`, and that the download itself still proceeds (a partial cover set is still worth saving, not a reason to fail the export).

**Timing**: exports up to 37 covers completed in 3–5 seconds, well inside the 20 s timeout. The new counting step is one `string.split()` on an SVG string already in memory — no additional network requests, no measurable cost.

## What Denis can do to actually close this

Everything above rules out what the bug *isn't*; it doesn't say what it *is*. The one thing that would: the next time this happens, the exact `posterPath` on the failing board (right-click the broken card → Inspect, or the Network tab during export) plus the browser and OS. If it recurs after this ships, `missing_covers` in PostHog narrows down when and how big the board was, even without that.
