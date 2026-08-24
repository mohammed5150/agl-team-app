# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build      # one-shot production build -> dist/
npm run dev        # esbuild --watch on app.jsx, demo flags ON, writes app.js at repo root
npm start          # serve dist/ on http://localhost:8080
npm test           # vitest run
npm run lint       # eslint .
npm run ci         # lint + test + build + verify-dist + smoke  (what CI runs)
npm run verify-dist    # PII gate over the built bundle
npm run smoke          # open the built app in real Chromium, assert it renders
npm run preflight      # probe the live deployment from outside
```

Single test file / single case:

```bash
npx vitest run tests/authz.test.js
npx vitest run -t "rejects a leave overlap"
```

`npm run smoke` needs Chromium once: `npx playwright install --with-deps chromium`
on Linux, or `npx playwright install chromium` on Windows — `--with-deps`
installs OS packages and only exists there.

## Architecture

A PWA for the Abu Dhabi Airports AGL maintenance team. React 18 + Supabase, bundled by esbuild. See `README.md` for the onboarding flow, the ordered migration list, and the go-live checklist; `docs/SECURITY.md`, `docs/BACKUP_RESTORE.md` and `docs/MONITORING.md` for operations.

**React is not bundled.** `React`, `ReactDOM` and `supabase-js` are UMD globals loaded from `vendor/` by `index.html`, pinned via `package-lock.json`. There are no CDN dependencies in production — this is what lets the CSP be `script-src 'self'`. Treat them as globals (eslint declares them `readonly`), never `import React`.

**`app.jsx` is the shell, `src/` is everything else.** `app.jsx` (~1500 lines) owns app state, routing and Supabase sync, and imports every page from `src/components/*.jsx` and every piece of logic from `src/*.js`. The split matters for testing: `src/` modules are pure and unit-tested; `app.jsx` is not directly tested by any suite.

**Three compile-time defines** are injected by `build.js` and must stay declared in `eslint.config.js`:

- `__SHOW_DEMO__` — demo login accounts **and** the seeded roster (real names, mobiles, passport / Emirates ID numbers)
- `__EMBED_TEAM_DIRECTORY__` — the approved Team Mail ID list (mostly personal Gmail addresses)
- `__APP_VERSION__` — build id stamped into error reports

Both data flags default to **off** and are opted into together via `SHOW_DEMO_LOGIN=1`. A bundle is a public document — anyone can fetch `/app.js` unauthenticated. Never deploy a demo build.

## The security model has two layers, and only one of them is the boundary

The database is the security boundary: RLS policies plus `SECURITY DEFINER` guard triggers, defined across the numbered `supabase_*.sql` migrations. `src/authz.js` decides only **what the UI offers**. A user who defeats the client gains nothing because the write is refused server-side.

When touching permissions, change both and keep them in step — every predicate in `authz.js` names the policy or trigger backing it. Roles are `employee` < `teamlead` < `manager`, ranked so "at least a team lead" is expressible without enumerating roles; `isStaff()` mirrors `public.is_staff()` in SQL.

Migrations are **order-dependent** and several are marked required-before-go-live in the README (notably 9, 12, 13, 16, 19, 20). Step 19 must run last, after every view exists. Step 18 requires the application to be deployed *first*. Read a migration's header comment before reordering anything.

## Gates that exist because something already shipped broken

Do not weaken these; each one is a scar.

**`scripts/smoke.mjs`** — the portal once shipped a crash that killed every render for every user (`Cannot access 'loadAudit' before initialization`), and *every* gate passed: eslint, 663 unit tests, the build, `verify-dist`, Netlify's "ready", and the uptime check. The fault does not exist until a browser evaluates the bundle, and no test mounts `App`. Smoke serves `dist/`, opens it in a real browser, and insists something rendered. Keep it dumb — no sign-in, no backend, no asserting on copy.

**`no-use-before-define`** in `eslint.config.js` (`functions: false`) — the rule that would have caught that outage. Hook dependency arrays are evaluated during render, where `const`s are still in TDZ.

**`scripts/verify-dist.js`** — reads the built file and fails on the **data**, not on the flag: any email address, employee number, Emirates ID or UAE mobile in `dist/app.js` fails the build. A refactor that reintroduces the leak by a different route fails here too. `ALLOWED_EMAILS` holds only invented placeholders; never add a real address.

## Keep the two CSPs in sync

The policy is declared twice: a `<meta http-equiv>` in `index.html` and an HTTP header in `netlify.toml`. Both are needed — `frame-ancestors` is ignored when delivered via meta. A browser given both enforces the **intersection**, so tightening one and not the other breaks the app confusingly. `tests/securityHeaders.test.js` fails if they disagree on a shared directive.

`netlify.toml` deliberately has **no `[build]` section**; the build command and publish dir live in the Netlify UI.

## Line endings are pinned, and that is load-bearing

`.gitattributes` sets `* text=auto eol=lf`, so every checkout matches what CI
tests. Before it existed, `core.autocrlf=true` gave Windows a CRLF working
tree and `tests/backup.test.js` could not be loaded there at all — Vite's
shebang strip does not account for a CR, so the file failed with a bare
`SyntaxError: Invalid or unexpected token`, no file, no line, no stack. The
suite silently reported 699 tests where it should have reported 724, and
Linux CI stayed green throughout. CI now runs on `ubuntu-latest` **and**
`windows-latest` so the half of the world you develop on is also tested.

Do not reintroduce a `#!` line in `scripts/*.mjs`. Nothing execs them (they
are mode 100644 and every call site goes through `node`), and combined with a
CRLF checkout a shebang makes the file unparseable to vitest.

## Gotchas

- **`scripts/assemble-app.mjs` and `scripts/split-modules.mjs` are stale one-shot refactor scripts.** They slice `app.jsx` by hardcoded line numbers reaching to 4163; the file is now ~1488 lines. They are not wired to any npm script. Running them will produce garbage — read them for history only.
- **`app.js` at the repo root is a gitignored build artifact** written by `npm run dev`. The deployed bundle is `dist/app.js`. Don't edit either.
- **`src/supabasePortal.js` commits the Supabase URL, the publishable key and the VAPID public key on purpose** — all three are public by design. The service-role key lives only in GitHub secrets (backup / uptime workflows) and must never enter the bundle.
- Some Supabase settings cannot be set by any migration (password minimum 12, leaked-password protection, redirect URLs). `npm run preflight` reports the four it cannot verify on every run; `docs/SECURITY.md` §6 is the full list.
- `preflight` aborts rather than reporting passes when it cannot reach the database — "refused" and "never arrived" look identical from outside.
