# Backup and recovery

What happens to the AGL Team Portal if Supabase is lost, and how the team gets
back to work.

The portal's entire record lives in one Supabase project: roster, leave
history, overtime, ratings, warnings, documents metadata and the audit trail.
Until this document existed there was no answer to "what if that project goes
away", which meant the honest answer was "we lose it".

---

## 1. What we are protecting against

| Scenario | Likelihood | Covered by |
|---|---|---|
| Accidental delete / bad bulk edit by an admin | Most likely | Supabase PITR, plus the audit trail to see what changed |
| Bad migration applied to production | Likely | Supabase PITR; the `supabase_*.sql` files in git are the schema's own backup |
| Supabase project paused (billing lapse) | Plausible | Unpause; **no data loss** — but the portal is down meanwhile |
| Supabase project deleted, or account compromised | Unlikely, severe | **Off-platform JSON export** (`scripts/backup-supabase.mjs`) |
| Supabase regional outage | Unlikely | Wait it out, or restore the export into a new project |
| Netlify / front-end lost | Plausible | Rebuild from git; the front end holds no state |

Supabase's own Point-In-Time Recovery is the first line of defence and handles
the top two rows better than anything here can. **It does not help with rows
three to five**, because it lives inside the thing that has gone away. That is
what the off-platform export is for.

---

## 2. Recovery objectives

These are the targets this plan is built to. They are deliberately modest —
the portal is an operational record, not a live control system, and a
half-day-old copy of the roster is far better than none.

| | Target | Why |
|---|---|---|
| **RPO** (data we accept losing) | **24 hours** | Nightly export. Losing under a day of leave requests is recoverable by asking people to re-submit; that is a bad afternoon, not a crisis. |
| **RTO** (time to working again) | **4 hours** | Provision a new project, apply migrations, restore, repoint the front end. Most of that is waiting on Supabase. |
| **Retention** | **90 days** of nightly exports, plus a monthly kept for **2 years** | Long enough to notice a slow corruption; the 2-year monthly matches the working assumption for UAE labour-record retention. |

If any of these numbers is wrong for the business, change them here first —
the schedule and the pruning job should follow this table, not the other way
round.

---

## 3. What is backed up, and what is not

`scripts/backup-supabase.mjs` exports every portal table to timestamped JSON.

**Included**

- `employees`, `leave_requests`, `overtime_requests`, `announcements`,
  `notifications`
- `push_subscriptions`, `approved_team_logins`
- `audit_log`, `profile_unlock_audit`
- `client_errors`

The list is checked against the `create table` statements in `supabase_*.sql`
by `tests/backup.test.js`, so a table added by a future migration fails the
suite until it is backed up. That check exists because the list drifted once:
`client_errors` was added by `supabase_monitoring.sql` after the script was
written and went unbacked-up until a manual cross-check against production
found it.

**Not included, and why**

| Not backed up | Where it actually lives | Recovery |
|---|---|---|
| Supabase Auth users and password hashes | `auth.users`, not reachable through PostgREST | Members sign in with their Team Mail ID and set a new password through the normal flow. Nothing to restore. |
| Schema, RLS policies, triggers, functions | The `supabase_*.sql` files **in this repository** | Re-apply them in order (README, "Database migrations"). Git is their backup. |
| Uploaded files | Nowhere — the portal stores document *metadata* only, not file contents | Nothing to restore today. Revisit if Supabase Storage is ever adopted. |
| The front end | This repository | `npm run build`, redeploy. |

> The service role key is required to take a backup. This is not optional
> convenience: a backup taken through an ordinary user session would silently
> omit every row RLS hides from that user, and restore a truncated roster that
> looks complete.

---

## 4. Taking a backup

### Automatically (the intended path)

`.github/workflows/backup.yml` runs nightly at 01:00 UTC and uploads the
export as a workflow artifact with 90-day retention. It needs two repository
secrets:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` |

The workflow fails loudly if the export contains zero rows — a wrong key, a
paused project and a wrong URL all produce an empty backup that would
otherwise exit 0 and look fine for months.

> **A GitHub artifact is not an off-site backup on its own.** It shares an
> account boundary with this repository. For the "account compromised" row of
> the risk table, download a monthly export and keep it somewhere with
> different credentials — a company OneDrive folder is enough. Put a calendar
> reminder on it; an undocumented manual step is one nobody does.

### Manually

```bash
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...        # never commit this

node scripts/backup-supabase.mjs --out backups
```

Produces `backups/<ISO timestamp>/` containing one JSON file per table plus
`manifest.json` (row counts, source project, git revision of the schema).

---

## 5. Restoring

### 5a. Something was deleted or mangled, and the project is fine

**Use Supabase PITR, not this script.** It is faster, it restores the schema
too, and it does not require reasoning about which rows changed.

Supabase Dashboard → Database → Backups → Point in Time → pick a moment
before the mistake.

Check the audit trail first (portal → Audit Trail, or query
`audit_privileged_changes`) to find *when* the bad change landed, so the
restore point is chosen from evidence rather than guessed.

### 5b. The project is gone, paused past recovery, or compromised

1. **Create a new Supabase project.** Note the new URL and keys.

2. **Apply the migrations in order**, from this repository, in the SQL editor.
   The order is listed in the README under "Database migrations" — it matters,
   because later files alter objects the earlier ones create.

3. **Restore the data.** Dry run first — that is the default:

   ```bash
   export SUPABASE_URL=https://NEW-PROJECT.supabase.co
   export SUPABASE_SERVICE_ROLE_KEY=eyJ...

   node scripts/restore-supabase.mjs backups/2026-08-10T01-00-00-000Z
   # review the row counts, then:
   node scripts/restore-supabase.mjs backups/2026-08-10T01-00-00-000Z \
     --execute --replace --confirm-target "$SUPABASE_URL"
   ```

   `--confirm-target` must repeat the URL exactly. It exists because a restore
   is normally run under pressure, in a shell that may still hold credentials
   for a different project.

   Use `--replace` when restoring into an empty project. Omit it to restore
   *into a live project*, where the script upserts and so repairs missing rows
   without destroying newer ones.

4. **Restore the append-only tables by hand.** `audit_log` and
   `profile_unlock_audit` are skipped by the script, deliberately: no role
   holds `INSERT` on them, because that is exactly what makes them
   trustworthy. To reload the history, in the SQL editor:

   ```sql
   -- Paste the JSON array from backups/<stamp>/audit_log.json
   insert into public.audit_log
   select * from jsonb_populate_recordset(null::public.audit_log, '<paste>'::jsonb);
   select setval('public.audit_log_id_seq', (select max(id) from public.audit_log));
   ```

   Do not grant `INSERT` to any role to make this easier. The whole value of
   the log is that it cannot be written from the API.

   `client_errors` is skipped too, for a different reason: it *is* writable,
   but `trg_stamp_client_error` overwrites `emp_id`, `email`, `role` and
   `occurred_at` from the current session on every insert. Replaying a backup
   through it would stamp every historical error with today's date and the
   restoring operator's identity — confident fiction rather than telemetry.
   Let it start empty; it is operational data, not a record anyone must keep.

5. **Point the front end at the new project.** Edit `SUPABASE_URL` and
   `SUPABASE_KEY` in `src/supabasePortal.js`, then `npm run build` and deploy.
   (These are the publishable keys — safe in the bundle. The service role key
   never goes near it.)

6. **Re-invite members.** Auth users are not restored. Employees sign in with
   their Team Mail ID and set a new password through the normal flow — their
   `employees` row is already there from step 3, so they land straight on the
   dashboard. Confirm the Auth settings match section 6 first, or the
   approved-address trigger will refuse everyone.

7. **Verify** with section 7 before telling the team it is back.

---

## 6. Auth settings the restore does not carry

These live in the Supabase dashboard, not in any migration, so a new project
starts without them. Set them **before** re-inviting anyone.

- **Authentication → Providers → Email**: enabled; "Confirm email" on.
- **Authentication → URL Configuration**: Site URL set to the portal's
  deployed URL, and that URL added to Redirect URLs — **password reset links
  do not work without this**.
- **Authentication → Policies**: minimum password length raised to **12** to
  match `src/passwordPolicy.js`, and leaked-password protection turned **on**.
  The client-side policy is a usability feature; these are the ones that bind.
- **Rate limits**: leave at the defaults unless there is a reason.

---

## 7. Verifying a restore

Do all of these. A restore that loaded rows but left the portal unusable is a
failed restore.

- [ ] `manifest.json` row counts match what the tables now hold
- [ ] Sign in as an employee → dashboard loads, own leave history is there
- [ ] Sign in as a team lead → whole roster visible, pending approvals listed
- [ ] Sign in as a manager → Audit Trail page loads and shows history
- [ ] Submit a leave request → it appears for the team lead
- [ ] Approve it as team lead → it moves to the manager's queue
- [ ] "Forgot your password?" → the email arrives and the link works
- [ ] An address that is **not** on `approved_team_logins` is refused at sign-in
- [ ] `npm run ci` passes against the rebuilt front end

---

## 8. Testing the plan

**Quarterly**, restore the most recent backup into a scratch Supabase project
and work through section 7. A backup nobody has restored is a hope, not a
plan, and the restore that has never been run is the one that fails on the day.

Record the date and outcome below. An empty table here means the plan is
untested.

| Date | Backup used | Restored by | Result |
|---|---|---|---|
| _(pending first drill)_ | | | |

---

## 9. Pruning

`audit_log` grows without bound. `supabase_audit_log.sql` provides
`prune_audit_log(interval)` but deliberately does **not** schedule it —
deleting audit history has a compliance dimension and should be an explicit
decision, not something a migration quietly started doing.

To run it monthly, once the retention above is confirmed as correct:

```sql
select cron.schedule(
  'prune-audit', '0 3 1 * *',
  $$select public.prune_audit_log(interval '2 years')$$
);
```

The function refuses to run as an end user, so a manager cannot trim the trail
that records what they did.
