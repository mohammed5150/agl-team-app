# ADB SAFEGATE — AGL Maintenance Team Portal

PWA for the Abu Dhabi Airports AGL maintenance team. React (UMD via CDN) +
Supabase, bundled with esbuild.

## Local development

```bash
npm install
npm run build      # one-shot build
# OR
npm run dev        # esbuild --watch on app.jsx (rebuilds app.js on save)
npm start          # serves dist/ on http://localhost:8080
```

## Deploy

This repo is connected to Netlify continuous deploy. Every push to `main`
triggers `npm run build` and publishes the `dist/` folder.

- Production: https://auh-adb-portal.netlify.app

## Project structure

```
app.jsx               app shell (state, routing, Supabase sync)
src/components/       feature modules (dashboards, leave, training, ...)
src/                  constants, helpers, seed data, Supabase layer
vendor/               self-hosted React / ReactDOM / supabase-js (pinned)
tests/                vitest unit tests (npm test)
index.html            shell + CSP + initial styles
manifest.json         PWA manifest
sw.js                 service worker (network-first for HTML/JS, cache-first for icons)
build.js              cross-platform build script (used by `npm run build`)
icon-*.png            PWA icons (generated from PHOTO-2026-04-27-21-41-51.jpg.jpeg)
supabase_*.sql        database migrations (apply in numerical / dependency order)
```

## Database migrations (apply in this order on a fresh Supabase project)

1. `supabase_schema.sql` — base tables
2. `supabase_overtime.sql` — overtime requests table
3. `supabase_phase5.sql` — TL/MGR seed
4. `supabase_rating.sql` — rating + profile_finalized columns
5. `supabase_notifications.sql` — notifications rebuild
6. `supabase_rls_policies.sql` — proper RLS (replaces permissive policies)
7. `supabase_tier.sql` — capability tier (T1-T4) + manager-only triggers
8. `supabase_push.sql` — web-push subscriptions table
9. `supabase_rls_hardening.sql` — **required before go-live**: drops the legacy
   plaintext password column, hides the directory from non-employees, blocks
   role/tier self-escalation, and pins leave status transitions per role
10. `supabase_team_onboarding.sql` — profile self-service + lock, unique login
    IDs, and the approved-Team-Mail-ID gate on `auth.users`
11. `supabase_grant_hardening.sql` — revokes the default PUBLIC EXECUTE grant
    left on the guard functions, and moves the roster backup out of the
    PostgREST-exposed schema
12. `supabase_audit_log.sql` — **required before go-live**: append-only
    `audit_log` recording who changed or approved what, written only by
    SECURITY DEFINER triggers and readable only by managers
13. `supabase_validation.sql` — status CHECK constraints plus overlap and
    range guards on leave and overtime
14. `supabase_monitoring.sql` — `client_errors` table for front-end error
    reporting (insert-only for users, manager-readable)

## Roles

- `manager` — full read/write, edits tier, creates invites
- `teamlead` — sees all employees + tiers, approves leave first stage
- `employee` — own profile, own leave requests, own notifications

## Onboarding flow

1. Manager opens Team page → **+ Invite Employee** (or **📋 Bulk Import (CSV)**)
2. Employee gets a placeholder row keyed by their email
3. Employee opens the portal URL → enters their email + chosen password
4. Supabase signs them up, sends a confirmation email via Resend
5. They click the link, log in, fill out their profile, click **Finalize**

## Publishing checklist (production go-live)

1. **Database** — unpause the Supabase project and apply all migrations above,
   including `supabase_rls_hardening.sql` (items 1-9 in order on a fresh
   project; just item 9 if the rest are already applied).
2. **Auth** — in Supabase Auth settings, restrict sign-ups to the company
   email domain (the login flow auto-registers first-time employees, so open
   sign-up would let anyone create an authenticated session).
3. **Build** — `npm run build` produces a production bundle. Demo mode
   (demo accounts + seeded roster) is compiled out by default; only
   `SHOW_DEMO_LOGIN=1 npm run build` re-enables it. Never deploy a demo
   build publicly — it embeds the real team roster in the bundle.
4. **Deploy** — publish `dist/` (Netlify). No CDN dependencies: React,
   ReactDOM and supabase-js are self-hosted under `vendor/` with versions
   pinned by `package-lock.json`.
5. **Passwords** — ensure every employee has set a personal password; the
   shared onboarding password must not remain valid on real accounts.
6. **Verify** — CI (`npm run ci`) runs lint + unit tests + build + dist
   verification. Smoke-test login, leave approval, and push notifications
   on the deployed URL before announcing.

Optional hardening: serve `frame-ancestors` / HSTS via Netlify response
headers (the CSP `<meta>` tag cannot express frame-ancestors).
