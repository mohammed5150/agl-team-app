# Security

How the portal is protected, what is enforced where, and what must be
configured outside this repository.

The portal holds employment records for the Abu Dhabi AGL maintenance team:
names, passport and Emirates ID numbers, addresses, mobile numbers, leave
history, ratings, warnings and pay bands. It is served from a public URL. The
controls below are sized for that.

---

## 1. The one rule

**The database is the security boundary. Nothing in the browser is.**

Every check in `src/` — `authz.js`, `passwordPolicy.js`, `validation.js`,
`onboarding.js` — exists so the UI can answer quickly and in plain words. Any
of them can be bypassed by anyone willing to open a console, and bypassing
them achieves nothing, because the write itself is refused by RLS or by a
`SECURITY DEFINER` trigger.

When you add a capability, add it in both places, and say in the client code
which server-side rule backs it. `src/authz.js` does this for every predicate;
follow that pattern.

---

## 2. Who can do what

| Capability | Roles | Enforced by |
|---|---|---|
| See own profile and requests | all | `emp_select_all`, `lr_select`, `ot_select` |
| See the whole roster | teamlead, manager | `emp_select_all` (gated on being a real employee) |
| First-stage leave approval | teamlead | `lr_update_tl` |
| Final leave approval | manager | `lr_update_mgr` |
| Overtime approval (final) | teamlead | `ot_update_tl`; managers have **no** UPDATE policy |
| Edit leave balances, ratings, warnings | teamlead, manager | `guard_employee_privileges` |
| Change role, tier, id, email | manager | `guard_employee_privileges` |
| Set band / airport / supplier | manager | `guard_employee_grading` |
| Reopen a finalized profile | manager | `guard_employee_profile_lock` rule 0 |
| Invite an employee | manager | `emp_insert_manager` |
| Offboard / suspend / reactivate | manager | `set_employment_status`, `guard_employment_status` |
| Read the audit log | manager | `audit_select_manager` |
| Read client errors | manager | `ce_select_manager` |
| **Delete an employee** | **nobody** | no DELETE policy — see §5 |

Overtime being team-lead-terminal is deliberate, not an oversight: the team
lead is the final approver and a manager never acts on one. The absence of a
manager UPDATE policy on `overtime_requests` is what enforces it.

---

## 3. Authentication

- **Who may have an account** — `approved_team_logins`, checked by the
  `is_approved_team_login` RPC and enforced by `trg_guard_auth_user_approved`,
  a BEFORE INSERT trigger on `auth.users`. GoTrue creates users through
  Postgres, so this refuses the account server-side. It is the one place RLS
  cannot reach and is what makes the gate real rather than cosmetic.
- **The client no longer carries the approved list.** A production bundle used
  to embed 35 addresses, most of them personal Gmail accounts, readable by
  anyone who fetched `/app.js`. The list is now compiled out
  (`__EMBED_TEAM_DIRECTORY__`) and `scripts/verify-dist.js` fails the build if
  an address survives. `checkApprovedTeamLogin` is three-valued so "cannot
  reach the RPC" is distinct from "refused" — callers must branch on
  `=== false`.
- **Passwords** — one policy, `src/passwordPolicy.js`, applied to first
  sign-in, change-password and reset alike. 12 characters, four character
  classes, no common or portal-related word, nothing containing the user's own
  name or email, no runs or repeats. **Raise the Supabase minimum to 12 to
  match** (§6) — the client-side policy is usability, that one binds.
- **Reset** — `resetPasswordForEmail`, with an identical outcome message
  whether or not the address has an account, so the form cannot enumerate who
  is registered. A live recovery session renders the reset screen ahead of
  every other route, so a half-finished reset cannot leak into the portal.
- **Throttling** — `createLoginThrottle` backs off after repeated failures per
  address. Per-tab and advisory; Supabase's own rate limit is the durable one.

---

## 4. What is recorded

`audit_log` (see `supabase_audit_log.sql`) records every change to
`employees`, `leave_requests`, `overtime_requests` and `announcements`:
who, when, which record, which columns, and the before/after values.

The properties that make it worth having:

- No role holds INSERT, UPDATE or DELETE. The trigger is the only writer, so
  an entry cannot be skipped or rewritten — including by the person it records.
- The actor is resolved from the JWT server-side, never taken from the client,
  and distinguishes an end user from a backend write from a manual SQL-editor
  change.
- Identity documents and contact details are recorded as **changed** but their
  values are replaced with `[redacted]`. "passport_no changed" is the auditable
  event; copying the number into a second table would widen the blast radius of
  any future mistake on that table for no investigative benefit.
- `prune_audit_log` refuses to run as an end user, so a manager cannot trim the
  trail that records what they did.

Managers read it in the portal (Audit Trail) or via `audit_approvals` /
`audit_privileged_changes`.

---

## 5. Deleting is not offboarding

There is **no DELETE policy on `employees`**, by design.

Deleting the row was previously the only way to remove someone who had left.
It also removed their leave history, ratings and warnings from every view that
joins on them, cascaded their push subscriptions away, and left the audit trail
pointing at an id that no longer resolves to a name. For an employment record
with a retention obligation that is data loss dressed up as a feature.

Offboarding sets `employment_status` instead. The record survives and stays
linked; the account cannot file new leave or overtime (`is_active_employee()`
in the INSERT policies), so a stale session or a direct API call is refused
too.

A genuine erasure request — a right-to-be-forgotten claim — is a deliberate
`service_role` operation in the SQL editor, where it is visible and
considered, not a button a tired manager can press at the end of a shift.

---

## 6. Configuration outside this repository

These live in the Supabase dashboard and no migration can set them. A restored
or new project starts without them.

- **Auth → Policies → Minimum password length: 12.** Match
  `src/passwordPolicy.js`. Without this, the real minimum is Supabase's default
  of 6 and the client policy is decorative.
- **Auth → Policies → Leaked password protection: ON.** Checks the chosen
  password against HaveIBeenPwned. This is the one control `passwordPolicy.js`
  fundamentally cannot provide: a password can satisfy every character rule
  and still appear in a breach corpus, and `BANNED_BASES` is a short
  hand-written list, not a corpus. Flagged as disabled by the Supabase
  security advisor.
- **Auth → Providers → Email:** enabled, "Confirm email" **on**.
- **Auth → URL Configuration:** Site URL set to the deployed portal URL, and
  that URL in Redirect URLs. **Password reset links do not work without this.**
- **Auth → Sign-ups:** the login flow auto-registers first-time employees, so
  the `auth.users` trigger is what gates this. Restricting sign-ups to the
  company domain is *additional* defence, not a replacement — several approved
  Team Mail IDs are personal Gmail addresses, so a domain restriction alone
  would lock them out.
- **Repository secrets:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for
  the backup and uptime workflows.

### Keys

- `SUPABASE_KEY` in `src/supabasePortal.js` is the **publishable** key. It is
  meant to be in the bundle; RLS is what protects the data behind it.
- The **service role key bypasses RLS entirely**. It belongs only in CI secrets
  and the Edge Function environment. It must never appear in this repository,
  in the bundle, or in a browser. If one leaks, rotate it in Project Settings →
  API immediately — every RLS policy in this document is void while it is out.
- The same applies to the newer **secret key** (`sb_secret_...`, env var
  `SUPABASE_SECRET_KEY`), which replaces the service role key under the new
  API-key naming. Edge Functions never read it directly: `@supabase/server`
  resolves the platform-injected value and exposes it only as the
  `supabaseAdmin` client after the caller's JWT has been verified.

---

## 7. Browser-side controls

- **CSP** — declared in both `index.html` (meta) and `_headers` (header).
  `frame-ancestors` only works as a header; the meta tag is ignored for it, so
  both exist and `tests/securityHeaders.test.js` fails the suite if they
  disagree on a shared directive.
- `connect-src` is `'self' https://*.supabase.co`. **Keep it that way.** It is
  why no third-party error tracker is used (see `docs/MONITORING.md`) — adding
  an external origin widens the one control that stops an injected script
  exfiltrating passport and Emirates ID numbers.
- No CDN: React, ReactDOM and supabase-js are vendored with versions pinned by
  `package-lock.json`, so a compromised CDN cannot serve script into the page.
- HSTS, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`
  are set in `_headers`.

---

## 8. Build-time controls

`npm run ci` runs lint, tests, build and `scripts/verify-dist.js`. The last one
is a gate, not a formality: it reads the built bundle and fails on **data** —
any embedded email address, any `ADB-nnn` employee number, Emirates ID or UAE
mobile, or the demo login panel. It does not trust the build flags, so a
refactor that reintroduces a leak by a different route fails too.

`ALLOW_DEMO_BUNDLE=1` is the deliberate escape hatch for a local demo build.
It is loud on purpose. **Never deploy a bundle built with it** — it carries
real staff contact details and document numbers.

---

## 9. Known gaps

Named so they are decisions rather than things nobody noticed.

- **No MFA.** Supabase supports TOTP. Worth adding for the manager role, which
  can change roles, pay bands and employment status. Not done here because it
  needs an enrolment flow and a recovery path of its own.
- **No session timeout.** A session persists until sign-out. On a shared
  device in a crew room that is a real exposure.
- **Notifications are still client-composed.** `can_notify` now stops an
  employee addressing a colleague — the in-app phishing vector — but staff can
  still write arbitrary text to anyone. The proper fix is a `SECURITY DEFINER`
  RPC that derives the recipient and the wording from the request being acted
  on. `supabase_rls_policies.sql` has noted this from the start.
- **The client-side login throttle is per-tab.** It slows a person, not a
  determined script. Supabase's server-side limit is the real control.
- **`documents` holds metadata only.** No file contents are stored, so there is
  no file-access control to get wrong — but also no actual documents. If
  Supabase Storage is ever adopted, bucket policies become a new surface.
- **No dependency scanning beyond CodeQL.** `npm audit` is not in CI.

---

## 10. If something goes wrong

- **Suspected credential compromise** — rotate the service role key first
  (Project Settings → API), then read `audit_log` filtered to
  `actor_context = 'service_role'` for the period in question.
- **Suspected account compromise** — suspend the account
  (Profile → Account → Suspend), then check `audit_privileged_changes` for
  anything they changed.
- **Data loss or a bad bulk edit** — `docs/BACKUP_RESTORE.md`. Use the audit
  trail to find *when* it happened, so the restore point is chosen from
  evidence rather than guessed.
- **Portal unreachable** — `docs/MONITORING.md`. The most likely cause by far
  is a paused Supabase project, which is one click to restore with no data
  loss.
