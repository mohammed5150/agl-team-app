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

The portal deploys to **Cloudflare Pages**: every push to `main` triggers
`npm run build` and publishes the `dist/` folder. Security headers travel
with the output in `_headers`, a format both Cloudflare Pages and Netlify
honour, so the legacy Netlify site keeps its headers until it is retired.
Setup and cutover steps: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

- Production (legacy, until cutover): https://auh-adb-portal.netlify.app

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
10. `supabase_overtime_bands.sql` — performance band / airport / supplier
    columns, the leave-manager status-transition fix, and the overtime request
    table with its team-lead-terminal workflow. Its header requires this to
    land after `supabase_rls_hardening.sql`
11. `supabase_team_onboarding.sql` — profile self-service + lock, unique login
    IDs, and the approved-Team-Mail-ID gate on `auth.users`
12. `supabase_grant_hardening.sql` — revokes the default PUBLIC EXECUTE grant
    left on the guard functions, and moves the roster backup out of the
    PostgREST-exposed schema
13. `supabase_audit_log.sql` — **required before go-live**: append-only
    `audit_log` recording who changed or approved what, written only by
    SECURITY DEFINER triggers and readable only by managers
14. `supabase_validation.sql` — status CHECK constraints plus overlap and
    range guards on leave and overtime
15. `supabase_monitoring.sql` — `client_errors` table for front-end error
    reporting (insert-only for users, manager-readable)
16. `supabase_security_v2.sql` — **required before go-live**: scopes who a
    notification may be addressed to, adds `employment_status` so offboarding
    deactivates instead of deleting, and removes the employee DELETE policy
17. `supabase_onboarding_selfservice.sql` — lets a manager approve a new
    joiner's Team Mail ID from the portal instead of needing SQL access
18. `supabase_roster_privacy.sql` — narrows `employees` to self-or-staff and
    adds the column-limited `employee_directory` view that keeps the colleague
    list working for everyone else. Deploy the application *before* this one;
    its header explains why
19. `supabase_view_grants_hardening.sql` — **required before go-live**: makes
    `employee_directory` read-only. It is a SECURITY DEFINER view, so the
    write privileges a stock Supabase project grants by default let any signed
    -in employee reach straight past RLS to `employees`. Must run last, after
    every view above exists
20. `supabase_overtime_guard_fix.sql` — **required**: makes
    `guard_request_immutable()` table-aware. Step 10 attaches the leave
    version of that guard to `overtime_requests`, which has different columns,
    so every team-lead approval or rejection of overtime failed with
    `record "new" has no field "start_date"`. Must run after step 10

## Roles

- `manager` — full read/write, edits tier, creates invites
- `teamlead` — sees all employees + tiers, approves leave first stage
- `employee` — own profile, own leave requests, own notifications

## Onboarding flow

A new joiner's address must be on the approved Team Mail ID list before they
can be invited or sign in — `trg_guard_auth_user_approved` enforces it at the
database, so this is not skippable. A manager can add it from the invite form
itself: if the address is not yet approved, the form offers to approve it and
retry. No SQL access needed.

1. Manager opens Team page → **+ Invite Employee** (or **📋 Bulk Import (CSV)**)
2. Employee gets a placeholder row keyed by their email
3. Employee opens the portal URL → enters their email + chosen password
4. Supabase signs them up, sends a confirmation email via Resend
5. They click the link, log in, fill out their profile, click **Finalize**

## Operations documentation

- **`docs/SECURITY.md`** — what is enforced where, the role/capability table,
  the Supabase dashboard settings no migration can set, and the known gaps.
- **`docs/BACKUP_RESTORE.md`** — recovery objectives, what is and is not
  backed up, and the step-by-step restore runbook.
- **`docs/MONITORING.md`** — uptime checks, front-end error reporting, and
  what to look at when the portal misbehaves.

## Publishing checklist (production go-live)

1. **Database** — unpause the Supabase project and apply all migrations above
   in order. Items 9, 12 and 15 are the ones that must not be skipped: they
   close privilege escalation, add the audit trail, and stop an employee
   record being deleted outright.
2. **Auth settings** — these live in the Supabase dashboard and no migration
   can set them (full list in `docs/SECURITY.md` §6):
   - **Minimum password length → 12**, matching `src/passwordPolicy.js`.
     Without this the real minimum is Supabase's default of 6 and the
     client-side policy is decorative.
   - **Leaked password protection → on.** Checks the password against
     HaveIBeenPwned — the one thing `passwordPolicy.js` cannot do, since a
     password can satisfy every character rule and still be in a breach corpus.
   - **URL Configuration** → Site URL set to the deployed URL and added to
     Redirect URLs. *Password reset links do not work without this.*
   - Email provider enabled with "Confirm email" on.
   - Note that a company-domain sign-up restriction is additional defence, not
     a replacement for the `auth.users` trigger — several approved Team Mail
     IDs are personal addresses and a domain rule alone would lock them out.
3. **Build** — `npm run build` produces a production bundle. Both the demo
   roster and the approved Team Mail ID list are compiled out by default;
   `SHOW_DEMO_LOGIN=1` re-enables them for local development. Never deploy
   such a build — it embeds real staff contact details and document numbers.
4. **Deploy** — publish `dist/` (Cloudflare Pages; see
   `docs/DEPLOYMENT.md`). No CDN dependencies: React, ReactDOM and
   supabase-js are self-hosted under `vendor/` with versions pinned by
   `package-lock.json`.
5. **Passwords** — ensure every employee has set a personal password; the
   shared onboarding password must not remain valid on real accounts. Members
   who are locked out now use **Forgot your password?** rather than needing an
   administrator.
6. **Backups and monitoring** — add the `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` repository secrets so the nightly backup and
   uptime workflows run, and create the `uptime` label. See
   `docs/BACKUP_RESTORE.md` §4 and `docs/MONITORING.md` §4.
7. **Preflight** — `npm run preflight` checks the deployment from outside:
   that the project is awake, that an anonymous caller is refused by RLS on
   every table, that the login gate answers, and that the schema is at the
   revision the code expects. It aborts rather than reporting passes if it
   cannot reach the database, because "refused" and "never arrived" look
   identical from the outside. It also prints the four items it cannot check
   — see step 2 — every run.
8. **Verify** — CI (`npm run ci`) runs lint + unit tests + build + dist
   verification. `verify-dist` is a gate, not a formality: it fails the build
   if any email address, employee number, Emirates ID or UAE mobile reaches
   the bundle. Smoke-test login, password reset, leave approval and push
   notifications on the deployed URL before announcing.
