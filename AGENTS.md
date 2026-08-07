# AGENTS.md — ADB SAFEGATE AGL Maintenance Team Portal

## Repository overview

PWA for the Abu Dhabi Airports AGL maintenance team. React 18 (UMD, self-hosted
under `vendor/`) + Supabase, bundled with esbuild. Deployed to Netlify from
`dist/`. No CDN runtime dependencies — React, ReactDOM, and supabase-js are
pinned in `vendor/`.

## Commands

```bash
npm install          # install dependencies
npm run lint         # ESLint (eslint.config.js)
npm test             # vitest unit tests (tests/)
npm run build        # production bundle → dist/
npm run verify-dist  # assert dist/ contains required files
npm run ci           # lint + test + build + verify-dist (matches CI)
npm run dev          # esbuild --watch (rebuilds app.js on save)
npm start            # serve dist/ on http://localhost:8080
```

> **CI gate** — every PR runs `npm run ci` via `.github/workflows/ci.yml`.
> Always run `npm run ci` before pushing.

> **Demo mode** — the demo login UI is compiled out by default. Use
> `SHOW_DEMO_LOGIN=1 npm run build` only for local testing. Never deploy a
> demo build publicly; it embeds the real team roster in the bundle.

## Project structure

```
app.jsx                    app shell — state, routing, Supabase sync
src/
  components/              feature pages (Dashboard, Leave, Training, …)
  constants.js             shared constants
  helpers.js               pure utility functions (tested)
  leaveWorkflow.js         leave state-machine logic (tested)
  nav.js                   navigation config
  rating.js                performance rating logic
  rosterPatterns.js        shift/roster patterns
  seedData.js              demo seed (compiled out in production)
  supabasePortal.js        all Supabase client calls
  uiPrimitives.jsx         shared UI components
src/LoginPage.jsx          login / onboarding page
src/ErrorBoundary.jsx      top-level React error boundary
tests/                     vitest unit tests (helpers, leaveWorkflow)
scripts/
  assemble-app.mjs         assemble dist/ during build
  split-modules.mjs        module splitter used by build
  verify-dist.js           post-build dist/ sanity check
build.js                   cross-platform build entry point
vendor/                    self-hosted React, ReactDOM, supabase-js (pinned)
supabase/functions/        Deno edge functions (send-push)
supabase_*.sql             database migrations (see README for apply order)
index.html                 HTML shell with CSP and initial styles
manifest.json              PWA manifest
sw.js                      service worker (network-first HTML/JS, cache icons)
```

## Architecture notes

- **No build-time JSX transform** for development; React is loaded as UMD via
  `index.html`, so `React` and `ReactDOM` are globals. The esbuild bundle
  (app.js) includes the full component tree.
- **All Supabase calls** are centralised in `src/supabasePortal.js`. Don't
  call `supabase.*` directly from components — go through that module.
- **Role model**: `manager` > `teamlead` > `employee`. RLS policies in
  `supabase_rls_*.sql` enforce this server-side. Never rely on client-side
  role checks alone for sensitive operations.
- **State machine** for leave requests lives in `src/leaveWorkflow.js`;
  add tests in `tests/leaveWorkflow.test.js` for any changes there.
- **ESLint** enforces React hooks rules and no unused vars. The
  `__SHOW_DEMO__` global is injected at compile time; guard demo code behind
  `if (__SHOW_DEMO__)`.

## Database migrations

Apply to a Supabase project in this order (see README for details):

1. `supabase_schema.sql`
2. `supabase_overtime.sql`
3. `supabase_phase5.sql`
4. `supabase_rating.sql`
5. `supabase_notifications.sql`
6. `supabase_rls_policies.sql`
7. `supabase_tier.sql`
8. `supabase_push.sql`
9. `supabase_rls_hardening.sql` ← **required before go-live**

## Testing guidance

- Unit tests live in `tests/` and use **vitest**.
- Cover pure logic (`helpers.js`, `leaveWorkflow.js`). UI components are not
  unit-tested; rely on manual smoke-testing against a Supabase project.
- Run `npm test` to execute all tests. All tests must pass before merging.

## What to avoid

- Do not commit secrets (Supabase keys, push VAPID keys). Use environment
  variables or Supabase Vault.
- Do not add CDN `<script>` tags to `index.html`. All runtime JS must be
  self-hosted or bundled.
- Do not modify files under `vendor/` without also updating the lock file and
  verifying the pinned versions match.
- Do not deploy with `SHOW_DEMO_LOGIN=1`.
