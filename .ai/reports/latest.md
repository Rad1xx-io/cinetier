# PostHog behind a same-origin proxy, so Firefox visitors are visible at all

Evidence vocabulary: **VERIFIED** (executed/measured here) · **CODE VERIFIED** · **INFERRED** · **UNKNOWN**.

## Which of the two diagnosed causes mattered

**Only the first.** They are both real, but only one of them was breaking anything:

| cause | verdict |
|---|---|
| Firefox ETP blocking `eu-assets.i.posthog.com` at the network layer | **this is the failure.** Requests never leave the browser, so nothing downstream matters |
| `connect-src` naming only `POSTHOG_ORIGIN`, not the `-assets` subdomain | **real, but blocked nothing** — the policy is sent `Content-Security-Policy-Report-Only`, which reports and does not enforce (CODE VERIFIED, and confirmed in the live headers below) |

Worth being precise about the second one, because the original note understated it: the assets host serves the **recorder bundle the SDK fetches lazily**, which is a `script-src` fetch, not `connect-src`. So the mismatch was not one missing entry in one directive — the asset origin appeared in *neither* directive. Report-only is the only reason that never mattered. Both are moot now that the traffic is same-origin.

## Which proxy option, and why

**`vercel.json` rewrites**, not PostHog's managed reverse proxy.

The managed option is genuinely better on two axes their docs name: free for Cloud users, and it moves proxied traffic off Vercel's egress billing — the docs call out session recordings (1–5 MB per session) as the biggest driver of that cost. Against that: it needs a DNS CNAME Denis adds by hand, outside the repository, so the configuration stops being reviewable in a diff and stops travelling with the code.

At this project's traffic the egress saving is theoretical; the "configuration lives in git" property is not. If traffic grows enough for the bill to be real, switching is three `destination` values and a DNS record — not a rewrite of anything. Stated rather than picked silently, because the alternative is a documented option and not a fallback.

## What changed

- **`vercel.json`** (new) — three rewrites under `/api/px`, in PostHog's documented order: `/static/*` and `/array/*` to `eu-assets.i.posthog.com`, catch-all to `eu.i.posthog.com`. EU throughout, matching `NEXT_PUBLIC_POSTHOG_HOST` (`https://eu.i.posthog.com`) — a region mismatch surfaces as 401s only after deploy, per their docs.
- **`app/providers/PostHogProvider.tsx`** — `api_host` is the proxy path; `ui_host` is derived from the ingest host (`eu.i.posthog.com` → `eu.posthog.com`) so the SDK's own links still reach the dashboard. `ui_host` is supported in the installed `posthog-js@1.417.1` — **VERIFIED** by reading `@posthog/types`, whose own doc comment describes this exact case, not by trusting the docs page.
- **`next.config.ts`** — `POSTHOG_ORIGIN` dropped from `connect-src`. `ENFORCED_CSP_DIRECTIVES`, the `/widgets/*` framing carve-out and the image hosts are untouched.
- **`__tests__/analytics-proxy.test.ts`** (new, 9 tests).

**Path naming:** `/api/px`, shaped like one of the app's own API routes. PostHog's docs are explicit that blockers match on path as well as domain, so `/analytics`, `/telemetry`, `/ingest` or `/posthog` would hand the problem straight back. Vercel checks the filesystem before applying a rewrite, so this cannot shadow a real route — the reverse can happen, and is written down: an `app/api/px/` route added later would silently take the prefix back.

**Not combined with `next.config` rewrites**, which PostHog warns can conflict. The project had none, so there was nothing to choose between.

## Verification

**Done here — VERIFIED:**

| check | result |
|---|---|
| `npm run typecheck` / `npm run lint` | clean (1 pre-existing, unrelated warning) |
| `npm test` | **1467 passed**, 118 files (was 1458 — 9 new) |
| `npm run build` | clean |
| `npx playwright test` | 15 passed |
| live headers, production build via `curl` | `connect-src 'self' https://…supabase.co https://*.vercel-scripts.com` — PostHog origin gone, everything else identical |
| HSTS, nosniff, Referrer-Policy, Permissions-Policy, enforced CSP, `X-Frame-Options` | all present and unchanged |
| `/widgets/*` framing carve-out | still exempt — no `X-Frame-Options`, no `frame-ancestors` |

**Negative controls — run, then reverted:**

- Drifted the provider's path away from `vercel.json`'s (`/api/px` → `/api/pixel`): **3 tests failed**. This is the most likely future breakage — two files that must agree, in different languages, with nothing connecting them.
- Pointed a rewrite at `us.i.posthog.com`: **2 tests failed**, including the region check written for the 401-after-deploy failure mode.

## What I could not verify, and why — UNKNOWN

The three checks the brief asks for **cannot be done from here**, and I would rather say so than imply the fix is confirmed:

1. **Firefox tracking-protection panel.** My browser tooling is Chromium-based; there is no Firefox I can drive, let alone one with default protections.
2. **An event landing in the PostHog dashboard.** No dashboard access from this session.
3. **CSP report-only violations gone from a fresh load.** Same reason as (1) — it needs the real browser on the real deployment.

There is also a hard technical floor: **`vercel.json` rewrites do not apply to `next start`**. VERIFIED — `/api/px/static/array.js` returns **404** against the local production build, exactly as expected. The proxy only exists on a Vercel deployment, so nothing about it is testable locally by construction.

What I *can* do once this PR's preview deploys is `curl` the proxy path there and confirm it returns PostHog's asset rather than a 404 — that closes "the rewrite works" end to end and leaves only the Firefox-specific half. I will do that and report the result.

**The Firefox checklist for Denis, on the preview or production URL, in a normal profile with protections at default:**

1. Open the site, then the shield icon in the address bar — the tracking-protection panel should list **nothing** blocked for `posthog`, where it previously listed `eu-assets.i.posthog.com`.
2. In the Network tab, requests to `/api/px/…` should be **200** and same-origin. If any show **401**, that is the region mismatch the docs warn about, not a proxy failure.
3. Trigger something instrumented (a sign-in produces `trackSyncDecision`), then check the PostHog activity feed for the event. Request leaving the browser is not the same as the event arriving — this is the step that actually proves the channel works.
4. Console on a fresh load: no CSP report-only violation naming `eu-assets.i.posthog.com`.

## Remaining risks

- **INFERRED**: that ETP was the sole reason Firefox events were missing. It is the one mechanism observed blocking at the network layer, and same-origin removes it — but if events still fail to arrive after this deploys, the next suspect is an ad-blocking extension matching on path, which is why the prefix is not an obvious one.
- **Vercel egress**: proxied traffic now bills as Vercel bandwidth, session replay included. Not a concern at current volume; the managed proxy is the documented answer if it becomes one.
- Local development is unaffected either way: `opt_out_capturing_by_default` is on in development, so the 404 above never fires in practice.
