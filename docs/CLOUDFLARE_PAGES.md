# Hosting the portal on Cloudflare Pages

The portal is a static bundle. Netlify serves it today; this document is what
you need to serve it from Cloudflare Pages instead, or to keep both running and
switch by moving DNS.

Nothing here is required. It exists so the decision is a DNS change rather than
a research project.

## Why you might

- **Latency.** Cloudflare has a point of presence in the UAE. The team is in
  Abu Dhabi, so HTML, JS and icons come off a much closer edge.
- **Build allowance.** 500 builds a month on the free plan, counted as builds
  rather than minutes. This project builds in about ten seconds, so neither
  host's free tier is a real constraint — but Cloudflare's is harder to
  exhaust by accident.
- **A second option.** The repo already carries the config for both, so an
  outage or a billing problem at one is not an emergency.

## Why you might not

- Netlify is working and the team knows it. Migrating hosts to fix a stuck
  deploy usually just moves the misconfiguration somewhere less familiar.
- Deploy previews, branch deploys and the GitHub integration all have to be
  set up again, and the URLs change.
- **It fixes nothing about database latency.** The Supabase project is in
  `ap-northeast-1` (Tokyo). Every query the portal makes still crosses to
  Japan and back, and that is a bigger day-to-day cost than which edge serves
  `index.html`. If speed is the reason for moving, move the database first.

## Setting it up

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to
Git**, then pick `mohammed5150/agl-team-app`.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(leave blank)* |

Environment variables, set for **both** Production and Preview:

| Name | Value | Why |
| --- | --- | --- |
| `SHOW_DEMO_LOGIN` | `false` | Demo mode ships the demo accounts *and* the seeded roster in the bundle. `build.js` requires an explicit opt-in, so an unset variable is already safe — this is belt and braces. |
| `NODE_VERSION` | `20` | Matches `.github/workflows/ci.yml`. Without it Cloudflare picks its own default, which drifts. |

That is the whole configuration. There is no `wrangler.toml`: Pages projects
built from Git are configured in the dashboard, and adding one would create the
same drift problem `netlify.toml` deliberately avoids by omitting `[build]`.

## Response headers

Cloudflare Pages does not read `netlify.toml`. It reads a `_headers` file from
the root of the published directory, so `_headers` lives in the repo root and
`build.js` copies it into `dist/` alongside `index.html`.

This means the security policy now exists in three places:

| Where | Applies when |
| --- | --- |
| `index.html` `<meta http-equiv>` | the file is opened locally, or the host sends no headers |
| `netlify.toml` | served from Netlify |
| `_headers` | served from Cloudflare Pages |

**They must agree.** A browser given both a meta policy and a header policy
enforces the intersection, so a directive tightened in one place and not the
others breaks the app in a way that is painful to trace.
`tests/securityHeaders.test.js` fails the suite if any two of them disagree on
a shared directive — that test is the only reason three copies is survivable.

When you add an origin to `connect-src`, you are editing three files and one
test. That friction is deliberate: `connect-src` is the list of places this app
may send data.

## Checking it worked

After the first deploy, against the `*.pages.dev` URL:

```bash
curl -sI https://<project>.pages.dev/ | grep -i -E \
  'content-security-policy|x-frame-options|strict-transport-security'
```

All three must come back. If they do not, `_headers` did not reach the output
directory — confirm `dist/_headers` exists after a local `npm run build`.

Then sign in and check the dashboard weather card renders. It is the only
feature that depends on `connect-src` naming a third-party origin, so it is the
fastest way to notice a CSP that arrived truncated.

## Cutting over

1. Deploy to Pages and let it run on the `*.pages.dev` URL for a few days.
2. Add the real hostname in **Custom domains** and complete the DNS change.
3. Leave the Netlify site deployed but no longer pointed at by DNS, so a
   rollback is a DNS change and not a redeploy.
4. Update `docs/MONITORING.md` and `.github/workflows/uptime.yml` — the uptime
   check still watches the Netlify URL and will keep reporting on a site
   nobody visits.

Step 4 is the one that gets forgotten. A green uptime check against the old
host is worse than no uptime check, because it looks like coverage.
