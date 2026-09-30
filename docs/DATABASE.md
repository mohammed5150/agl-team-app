# Database

The Supabase (Postgres) schema: what exists, what guards it, and the rules for
changing it. The authoritative definitions are the `supabase_*.sql` migrations
at the repository root — **apply them in the numbered order in `README.md`**;
they are order-dependent and several are marked required-before-go-live
(notably 9, 12, 13, 16, 19, 20). Read a migration's header comment before
reordering anything. Step 19 must run last, after every view exists; step 18
requires the application to be deployed first.

**The database is the security boundary** — RLS policies plus
`SECURITY DEFINER` guard triggers, not the client. `src/authz.js` only decides
what the UI offers. See `docs/SECURITY.md` for the full model.

---

## 1. Tables

| Table | Purpose |
|---|---|
| `employees` | The roster: profile, documents (passport/EID/visa expiries), leave balances, roster JSON, rating, tier (T1–T4), grading (band/airport/supplier), `employment_status` (offboarding deactivates, never deletes), `profile_finalized` lock. Direct reads are self-or-staff only; everyone else uses `employee_directory`. |
| `leave_requests` | Leave with a **two-stage workflow**: team lead first, then manager. Status transitions are pinned per role by trigger; overlap and range guards apply. |
| `overtime_requests` | Overtime with a **team-lead-terminal workflow** — a manager never acts on one, so there are no `mgr_*` columns. Daily-total guard applies. |
| `announcements` | Team announcements (priority, pinned, target audience). |
| `notifications` | Per-user in-app notifications. Who a notification may be addressed to is scoped by policy; rows are immutable once written except the `read` flag. |
| `push_subscriptions` | Web-push endpoints per user (`endpoint` unique, `p256dh`/`auth` keys), written by `src/supabasePortal.js`. |
| `approved_team_logins` | The approved Team Mail ID allowlist. `guard_auth_user_approved` on `auth.users` makes sign-up impossible for an unapproved address — not skippable from any client. |
| `audit_log` | Append-only trail of who changed or approved what. Written **only** by `SECURITY DEFINER` triggers (`record_audit`), readable only by managers. |
| `client_errors` | Front-end error reports (insert-only for users, manager-readable), stamped server-side by `stamp_client_error`. |
| `profile_unlock_audit` | Records manager unlocks of finalized profiles (`record_profile_unlock`). |
| `app.slack_notify_config` | Server-side Slack notification config, outside the PostgREST-exposed schema. |

## 2. Views

| View | Purpose |
|---|---|
| `employee_directory` | Column-limited colleague list that keeps the directory working after `employees` was narrowed to self-or-staff. It is `SECURITY DEFINER`, which is why `supabase_view_grants_hardening.sql` must make it read-only — default grants would let any signed-in user write straight past RLS. |
| `audit_approvals` | Manager view over approval events in `audit_log`. |
| `audit_privileged_changes` | Manager view over role/tier/grading changes. |
| `client_error_summary` | Aggregated front-end error reporting for `docs/MONITORING.md`. |

## 3. Functions

**Helpers used inside policies** — `current_emp_id()`, `current_emp_role()`,
`is_staff()`, `is_manager()`, `is_active_employee()` (plus `app.`-schema
copies). `src/authz.js` mirrors `is_staff()` client-side; keep them in step.

**Guard triggers (`SECURITY DEFINER`)** — the enforcement layer:
`guard_auth_user_approved`, `guard_employee_email_approved` (Team Mail ID
gate), `guard_employee_privileges` and `employees_protect_tier*` (no role/tier
self-escalation), `guard_employee_grading` (band/airport/supplier are
manager-only), `guard_employee_profile_lock` (finalized profiles),
`guard_employee_delete` / `guard_employment_status` (offboarding deactivates),
`guard_leave_overlap`, `guard_overtime_daily_total`,
`guard_request_immutable` (table-aware since
`supabase_overtime_guard_fix.sql` — the leave version attached to
`overtime_requests` broke every overtime approval),
`guard_notification_immutable`, and `record_audit`.

**RPCs callable from the client** — `is_approved_team_login`,
`approve_team_login`, `set_employment_status`, `list_team_logins`,
`revoke_team_login`, `record_profile_unlock`. `supabase_grant_hardening.sql`
revoked the default PUBLIC EXECUTE on the guard functions — a new function
needs its grants stated explicitly.

**Maintenance** — `prune_audit_log`, `prune_client_errors`.

## 4. Roles

`employee` < `teamlead` < `manager`, ranked so "at least a team lead" is
expressible without enumerating roles. Managers get full read/write, tier
edits and invites; team leads see all employees and take the first leave
approval stage (and the only overtime stage); employees see their own rows.

## 5. Conventions for changes

- **snake_case in SQL, camelCase in JS**; the only translation point is the
  `*ToDb`/`*FromDb` mappers in `src/supabasePortal.js`. A new column means a
  migration **and** a mapper change.
- New migrations are additive files at the repo root, appended to the README's
  ordered list, with a header comment stating what they do and any ordering
  requirement.
- Every new table gets RLS enabled and policies written for `authenticated`
  (not `public` — an expired session falls back to the anon key and matches
  `public` policies; that bug is what `supabase_expired_session_fix.sql`
  fixed). Anything a user must not be able to forge goes in a
  `SECURITY DEFINER` trigger, not the client.
- When a change touches permissions, update `src/authz.js` in the same commit
  and name the backing policy/trigger in its comment.
- Some settings cannot be set by migration at all (password minimum length,
  leaked-password protection, redirect URLs) — `docs/SECURITY.md` §6 is the
  list, and `npm run preflight` reports them every run.

## 6. Backup and restore

The nightly backup workflow and the restore runbook are documented in
`docs/BACKUP_RESTORE.md`; the backup uses the service-role key held only in
GitHub secrets — it must never appear in the client bundle.
