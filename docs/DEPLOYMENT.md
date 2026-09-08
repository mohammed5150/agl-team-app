# Deployment — Cloudflare Pages

> **STATUS: PAUSED (2026-08-22).** The migration below was never executed —
> no Pages project was created and DNS was never cut over. Netlify works
> fine and remains the production host (https://auh-adb-portal.netlify.app,
> auto-deploying `main`). The steps are kept only in case the migration is
> ever revived; do not follow them as part of routine deployment.

The portal is a static bundle (`dist/`) plus Supabase. Hosting therefore only
has two jobs: serve the files, and send the security headers in `_headers`.
This document covers setting up Cloudflare Pages and cutting over from the
legacy Netlify site without an outage.

## 1. Create the Pages project

In the Cloudflare dashboard → **Workers & Pages → Create → Pages →
Connect to Git**, select this repository and use:

| Setting            | Value                                          |
|--------------------|------------------------------------------------|
| Production branch  | `main`                                         |
| Build command      | `npm run build && npm run verify-dist`         |
| Build output       | `dist`                                         |

`verify-dist` is part of the build command on purpose: it is the gate that
refuses a bundle carrying roster PII or email addresses (see
`scripts/verify-dist.js`), and a deploy is exactly the moment it must run.

Environment variables: **none**. In particular, never set `SHOW_DEMO_LOGIN`
on the Pages project — a demo build embeds real staff contact details, and
`verify-dist` will (correctly) fail the deploy if it is set.

The build stamps `CF_PAGES_COMMIT_SHA` into error reports automatically
(`build.js`), so faults remain traceable to the commit that shipped them.

## 2. Verify headers before pointing anyone at it

The whole reason `_headers` exists is that `frame-ancestors` only works as a
real HTTP header (see the comments in `_headers`). After the first deploy:

```sh
curl -sI https://<project>.pages.dev | grep -iE \
  'content-security-policy|x-frame-options|strict-transport|referrer-policy'
```

Every header in `_headers` must appear. If none do, the file did not reach
the output directory — check that `build.js` copied it into `dist/`.

Then run the external checks against the new URL:

```sh
npm run preflight
npm run smoke -- --url https://<project>.pages.dev
```

## 3. Cut over the domain

Order matters here. Netlify enforces global uniqueness for custom domains,
and a domain still attached to the Netlify site cannot cleanly move; done in
the wrong order this ends in the "Another site is using this domain" error,
which can take a support ticket to unwind.

1. Lower the DNS TTL on the portal's records to 300s and wait out the old TTL.
2. Add the custom domain to the Pages project (**Custom domains → Set up a
   domain**) and let the TLS certificate issue.
3. Point DNS at Cloudflare Pages (CNAME to `<project>.pages.dev`).
4. Confirm the live domain serves from Pages and still sends every header
   (same `curl -sI` as §2, against the real domain).
5. **Remove the custom domain from the Netlify site** — do not skip this or
   delete the Netlify site while it still holds the domain; a stale claim
   there blocks any future re-add and requires Netlify support to release.
6. In Supabase → **Authentication → URL Configuration**, make sure the Site
   URL and redirect allow-list match the domain being served (unchanged if
   the domain itself is unchanged; required if the `pages.dev` URL is used
   anywhere, e.g. password-reset emails).

## 4. After cutover

- Update the uptime workflow's URL (`docs/MONITORING.md` §4) and the
  production URL in `README.md`.
- Smoke-test login, password reset, leave approval and push notifications on
  the live domain — push in particular, since its service-worker registration
  is origin-scoped.
- Once a week has passed with no fallback needed, retire the Netlify site.
  Only then is deleting it safe: by that point it holds no custom domain.

The `_headers` format is honoured by Netlify too, so between the first Pages
deploy and Netlify's retirement, both hosts serve identical headers from the
same file — there is no window where the legacy site drifts.
