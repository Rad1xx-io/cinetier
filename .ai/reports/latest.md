# The 308 and the rejected cookie, after the PostHog proxy

Two loose ends from PR #73. The proxy itself is confirmed working — Denis saw `Pageview` and `sync_decision` landing in the PostHog dashboard from real Firefox with default protections, which is the one verification I could not do myself.

Evidence vocabulary: **VERIFIED** (measured here) · **CODE VERIFIED** · **INFERRED** · **UNKNOWN**.

## 1. The 308 — Next's own redirect, not the proxy

**Cause, VERIFIED rather than inferred.** PostHog's ingest paths end in a slash (`/i/v0/e/`, `/decide/`). Next normalises a trailing slash away with a 308, and Vercel processes redirects **before** rewrites — so Next's redirect won the race with the proxy rewrite every time, and every event cost two round trips with the first thrown away.

The measurement that settles it: against a **local production build, where `vercel.json` does not apply at all**, so no rewrite exists to be involved —

| request | before | after |
|---|---|---|
| `POST /api/px/i/v0/e/` | **308** | **404** |

404 is the correct local answer (nothing serves that path without the rewrite). What matters is that the 308 is gone with no rewrite anywhere near it, which is what proves the redirect was Next's own. On Vercel, where the rewrite does exist, the request now reaches it directly: one request, 200, no preceding 308.

The fix is `skipTrailingSlashRedirect: true`. PostHog's Next.js guide calls it mandatory, and — as the brief suspected — it is genuinely unrelated to which mechanism does the proxying: it governs Next's redirect, not the rewrite.

**Checked that it does not touch the app's own routes, rather than assuming:**

| route | before | after |
|---|---|---|
| `/discover/` | 308 → `/discover` | **200**, same page (identical `<title>`) |
| `/discover` | 200 | 200 |
| `/films` (the app's own configured redirect) | 308 | **308**, unchanged |

The last row is the one worth noting: `skipTrailingSlashRedirect` disables only Next's *automatic* trailing-slash normalisation. Redirects the app declares itself still work.

**The one real cost, and why it is covered.** `/discover/` and `/discover` now both answer 200, which is duplicate URLs from a search engine's point of view. Both emit the identical canonical — **VERIFIED**, not assumed:

```
<link rel="canonical" href="https://tierlistonline.com/discover"/>
```

So the slash-less URL is still the one declared canonical, which is what the redirect was doing for search engines. The tag that is meant to do that job is doing it.

## 2. The `dmn_chk_…` cookie — the probe working, and now switched off

**It is posthog-js's cross-subdomain cookie domain discovery. CODE VERIFIED by reading the installed `posthog-js@1.417.1`, not inferred from the name:**

```js
if (["localhost","127.0.0.1"].includes(t)) return "";
for (var i = t.split("."), s = Math.min(i.length, 8), n = "dmn_chk_" + es(); !rs && s--;) {
  var o = i.slice(s).join("."),
      a = n + "=1;domain=." + o + ";path=/";
  e.cookie = a + ";max-age=3";
  e.cookie.includes(n) && (e.cookie = a + ";max-age=0", rs = o);
}
```

It works out the widest domain it may scope its cookie to by *trying* to set one: it walks the hostname's suffixes from the shortest upward, writes `dmn_chk_<random>=1;domain=.<suffix>` with a three-second lifetime, and keeps the widest that sticks — deleting it again immediately with `max-age=0`.

For `tierlistonline.com` the first suffix tried is `.com`, which every browser refuses as a public suffix. Firefox reports that refusal as `Cookie "dmn_chk_…" has been rejected for invalid domain`. **So the message is the probe finding its answer, not a fault** — and it is not a leftover of the old cross-domain setup, nor caused by the proxy: the loop depends only on the hostname and would have logged the same line before PR #73.

**Harmless, and still worth removing.** The probe self-deletes when it succeeds, so nothing persists. But cross-subdomain identity buys this app nothing — one hostname, no subdomain sharing a session — and an unexplained red line on every page load costs attention every time somebody opens the console for something else. `cross_subdomain_cookie: false` skips the discovery entirely; the option is documented in `@posthog/types` as exactly this switch. If a subdomain ever needs to share identity, that one line is what to remove.

## Verification

| check | result |
|---|---|
| `npm test` | **1476 passed**, 118 files (was 1474 — 2 new) |
| typecheck / lint / build | clean · clean (1 pre-existing warning) · clean |
| `npx playwright test` | 15 passed |
| before/after against a real production build | measured, table above |

**Negative controls — run, then reverted:** removing `skipTrailingSlashRedirect` fails its test; removing `cross_subdomain_cookie` fails its own. Both assertions live in `analytics-proxy.test.ts` beside the rest of the proxy's pins.

## Remaining risks

- **UNKNOWN until deployed**: that the Vercel-side result is a single 200 with no 308. Locally the redirect is provably gone, but the rewrite only exists on a deployment, so the final shape of that request is one round trip *inferred* from the redirect no longer firing. Worth a glance at the Network tab after this ships — one request to `/api/px/i/v0/e/`, 200, nothing before it.
- Duplicate URLs are now reachable (`/x` and `/x/`). Canonicals cover the search-engine side; nothing in the app links to the slash form.
