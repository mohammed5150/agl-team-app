# Notion sync

A nightly export of a roster and leave-calendar **summary** to Notion, for
visibility outside the portal (shift planning, an ops dashboard) without
handing Notion — or anyone with access to it — a login to Supabase. Runs via
`.github/workflows/notion-sync.yml` → `scripts/sync-notion.mjs`, at 01:30 UTC,
shortly after the nightly backup (`docs/BACKUP_RESTORE.md`). Off by default:
with no Notion secrets configured, the workflow fails loudly at its
secrets-check step rather than "succeeding" while doing nothing.

## 1. What is synced, and what deliberately is not

Same reasoning as the Slack alert and the decision not to adopt a third-party
error service (`docs/MONITORING.md` §6): Notion is a third party the portal
otherwise has no relationship with, so this exports a narrow, non-sensitive
summary rather than the full tables.

**Roster** — `id`, `name`, `section`, `designation`, `role`, `tier`, `band`,
`airport`, `supplier`, `employment_status`, and the four leave/sick/comp-off
balance columns.

**Leave calendar** — `id`, employee name, `section`, `type`, `start_date`,
`end_date`, `days`, `status`.

**Never sent to Notion:** email, mobile, date of birth, marital status,
address, emergency contact, passport number/expiry, visa expiry, Emirates ID
number/expiry, or any free-text field — leave `reason` and the team-lead /
manager comment columns can carry medical or personal detail an employee
volunteered, and are excluded even though they would be convenient to see on
a calendar. If a future export genuinely needs one of these, that is a
decision to make explicitly here, not an addition to slip into
`scripts/sync-notion.mjs` incidentally.

## 2. Notion-side setup

The script fills an existing schema — Notion's API cannot create database
properties from data, only write to properties that already exist. Create two
databases (in the same workspace as wherever you want this to live) with
these properties, matching name and type exactly:

**Roster database**

| Property | Type |
|---|---|
| Employee ID | Title |
| Name | Text |
| Section | Text |
| Designation | Text |
| Role | Select |
| Tier | Select |
| Band | Select |
| Airport | Text |
| Supplier | Text |
| Employment Status | Select |
| Annual Leave | Number |
| Annual Leave Used | Number |
| Sick Leave | Number |
| Sick Leave Used | Number |
| Comp Off | Number |

**Leave calendar database**

| Property | Type |
|---|---|
| Employee ID | Title |
| Employee | Text |
| Section | Text |
| Type | Select |
| Start Date | Date |
| End Date | Date |
| Days | Number |
| Status | Select |

`Employee ID` is the portal's own row id (e.g. `EMP-014`, `LR-231`) and is how
the script matches an existing Notion page on re-run — it upserts, never
duplicates, and never deletes a page itself.

Then create a Notion internal integration (Notion → **Settings → Connections
→ Develop or manage integrations → New integration**), copy its token, and
**share both databases with it** (each database's `···` menu → **Connections**
→ add the integration) — a token with no access to a database gets a 404 from
the Notion API indistinguishable from a wrong database id.

## 3. Repository secrets

| Secret | Value |
|---|---|
| `NOTION_TOKEN` | The internal integration token from step 2 |
| `NOTION_ROSTER_DB_ID` | The roster database's id (from its URL) |
| `NOTION_LEAVE_DB_ID` | The leave calendar database's id (from its URL) |

Either database id may be omitted to sync only the other; both may not be
omitted at once — the workflow refuses to run with nothing configured to
sync. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (already required for the
nightly backup) are reused to read the source data — the service role key is
required because a sync run through an end-user session would silently omit
whatever RLS hides from that user.

## 4. Running it by hand

```sh
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
NOTION_TOKEN=secret_... \
NOTION_ROSTER_DB_ID=... \
NOTION_LEAVE_DB_ID=... \
node scripts/sync-notion.mjs
```

Or trigger the workflow from the Actions tab (`workflow_dispatch`).

## 5. Limitations

- **Not real-time.** Nightly only; Notion will lag same-day changes by up to
  24 hours. If that is not good enough, this is the wrong mechanism —
  consider the Slack alert (`docs/MONITORING.md` §6) for anything that needs
  to be seen immediately.
- **No deletes.** An employee or leave request removed from the portal is not
  removed from Notion by this script. Archive it there by hand, or extend the
  script deliberately if this becomes a recurring need.
- **Rate limiting is a fixed delay, not backoff.** `scripts/sync-notion.mjs`
  waits a fixed ~350ms between Notion API calls rather than reading Notion's
  rate-limit headers. Fine for a roster of a few hundred; revisit if the
  employee count grows enough for a nightly run to take an uncomfortably long
  time.
