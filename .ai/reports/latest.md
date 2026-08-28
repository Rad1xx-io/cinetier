# Static pages: /about, /privacy, /terms

## PR and CI

_Filled in after the PR is opened and CI is confirmed — see chat for the final status table._

## What changed

### 1 · Three new static pages

`app/about/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx` — each a plain
`export const metadata: Metadata` object (title, description, `alternates.canonical`,
Open Graph, Twitter card), matching the pattern already used by `app/discover/page.tsx`
for pages with no dynamic route params. `generateMetadata` was requested by name, but
that async form is reserved in this codebase for pages that need it — `app/u/[username]/page.tsx`
is the only real example, driven by the dynamic `username` param. None of the three new
pages have one, so the plain export is the actual existing convention, and using it here
is a deliberate reading of "follow the existing pattern" over the literal function name.

- **About** — short, direct paragraph in the homepage hero's voice: what the site does,
  that it's an independent solo project, not affiliated with TMDB/IGDB/YouTube.
- **Privacy** — written from the actual codebase, not boilerplate: Supabase Auth (Google
  OAuth + magic-link email, no passwords stored), local-first boards mirrored to Supabase
  once signed in, publish-time snapshotting, custom image uploads (2 MB cap, JPEG/PNG/WebP,
  server-enforced rights checkbox, manual-only report review — no automated content
  scanning), PostHog analytics (page views + product events tied to account id, never
  email; session recording with all inputs masked, including the magic-link email field;
  no ad networks, no cookie-consent banner since none exists in the app today), TMDB/IGDB/
  YouTube catalogue data with no account info sent, affiliate "where to watch" links and
  the donate button both described as outbound-only with no payment handled on-site, and
  a deletion-request contact email.
- **Terms** — short UGC acceptable-use terms: content ownership, forking etiquette, the
  right to remove content on report, no-warranty disclaimer, "terms may change" clause.

### 2 · Footer links

`app/layout.tsx`'s footer (previously just the TMDB attribution line) now has an About /
Privacy / Terms nav row above it. The `hidden ... md:block` behavior on the `<footer>`
itself is untouched — still desktop-only, same as before.

### 3 · Sitemap

All three routes added to `SITEMAP_ROUTES` in `lib/seo/site.ts` at `priority: 0.3`,
`changeFrequency: "yearly"` — informational pages, ranked below every content route.

## Contact email decision

`kseronikseu@gmail.com` is used on `/privacy` as the account/data-deletion contact,
per explicit confirmation from the user — this address appeared earlier in the session
as a third party's test account affected by an unrelated data-isolation bug, so it was
flagged and re-confirmed before use. Logged in `.ai/DECISIONS.md`; not to be re-litigated
without a new reason.

## Verified

- `npm run lint` — clean (1 pre-existing unrelated warning in `__tests__/post-delete.test.tsx`)
- `npm run typecheck` — clean
- `npm test` — 911/911 passing (75 files)
- `npm run build` — clean; `/about`, `/privacy`, `/terms` all prerender as static (`○`)
- Playwright screenshots taken against the production build (`.ai/reports/shots/`):
  `footer-with-links.png`, `about-page.png`, `privacy-page.png`, `terms-page.png`
