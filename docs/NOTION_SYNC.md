# Notion sync

A nightly export of the roster, leave calendar and overtime log to Notion, so
they're visible outside the portal without handing Notion — or anyone with
access to it — a login to Supabase. Runs via
`.github/workflows/notion-sync.yml` → `scripts/sync-notion.mjs`, at 01:30 UTC,
shortly after the nightly backup (`docs/BACKUP_RESTORE.md`). Off by default:
with no Notion secrets configured, the workflow fails loudly at its
secrets-check step rather than "succeeding" while doing nothing.

## 1. Why full detail

Earlier revisions of this sync exported a narrow, non-PII summary — the same
reasoning documented in `docs/MONITORING.md` §6 for the Slack alert, and in
`supabase_monitoring.sql` for not adopting a third-party error service:
Notion sits outside the portal's RLS and CSP boundary, and an HR portal's
full rows carry employee identifiers, document numbers and free-text fields
that can contain medical or personal detail.

**That scoping has been deliberately reversed, by explicit request.** Every
column in `employees`, `leave_requests` and `overtime_requests` is now
synced — email, mobile, date of birth, address, passport number and expiry,
visa expiry, Emirates ID number and expiry, and every free-text reason or
comment field. This is a real tradeoff, not a detail: that data now lives in
a system with its own access model, its own sharing settings, and its own
retention — none of them governed by this repository's RLS policies,
`docs/SECURITY.md`, or `audit_log`. If you widen who (or what integration)
has access to the two-or-three Notion databases below, you are widening who
can see passport and Emirates ID numbers for the whole roster. Revisit this
section, not just the property list, before doing that.

JSONB columns (`achievements`, `warnings`, `actions`, `training` on
`employees`) have no Notion property equivalent — they're serialized to JSON
text, truncated at Notion's 2000-character rich-text limit like any other
text field. `roster` and `documents` are not synced at all: the first is a
large nested working-hours structure with no natural Notion property shape,
the second is file metadata that would need Notion's own file-upload
handling to mean anything. Extend `scripts/sync-notion.mjs` deliberately if
either becomes worth the effort, rather than stringifying them in place.

## 2. Notion-side setup

The script fills an existing schema — Notion's API cannot create database
properties from data, only write to properties that already exist. Create
three databases (in the same workspace as wherever you want this to live)
with these properties, matching name and type exactly. Any one of the three
may be skipped by leaving its database id unset (§3) — the workflow only
requires at least one.

**Roster database**

| Property | Type | | Property | Type |
|---|---|---|---|---|
| Employee ID | Title | | Emirates ID No | Text |
| Name | Text | | Emirates ID Expiry | Date |
| Email | Text | | Tier | Select |
| Section | Text | | Band | Select |
| Designation | Text | | Airport | Text |
| Shift | Text | | Supplier | Text |
| Role | Select | | Employment Status | Select |
| Nationality | Text | | Annual Leave | Number |
| Mobile | Text | | Annual Leave Used | Number |
| Employee No | Text | | Sick Leave | Number |
| DOB | Date | | Sick Leave Used | Number |
| Marital Status | Text | | Comp Off | Number |
| Address | Text | | Achievements (JSON) | Text |
| Join Date | Date | | Warnings (JSON) | Text |
| Emergency Contact Name | Text | | Actions (JSON) | Text |
| Emergency Contact No | Text | | Training (JSON) | Text |
| Passport No | Text | | | |
| Passport Expiry | Date | | | |
| Visa Expiry | Date | | | |

**Leave calendar database**

| Property | Type |
|---|---|
| Employee ID | Title |
| Employee | Text |
| Employee ID Ref | Text |
| Section | Text |
| Type | Select |
| Start Date | Date |
| End Date | Date |
| Days | Number |
| Reason | Text |
| Status | Select |
| Applied On | Date |
| TL Comment | Text |
| Mgr Comment | Text |
| TL Action Date | Date |
| Mgr Action Date | Date |
| TL Name | Text |
| Mgr Name | Text |

**Overtime log database**

| Property | Type |
|---|---|
| Employee ID | Title |
| Employee | Text |
| Employee ID Ref | Text |
| Section | Text |
| Work Date | Date |
| Hours | Number |
| Reason | Text |
| Status | Select |
| Applied On | Date |
| TL Comment | Text |
| TL Action Date | Date |
| TL Name | Text |
| Comp Off Days | Number |

`Employee ID` is the portal's own row id (e.g. `EMP-014`, `LR-231`,
`OT-088`) and is how the script matches an existing Notion page on re-run —
it upserts, never duplicates, and never deletes a page itself. `Employee ID
Ref` on the leave/overtime databases is the *employee's* id (e.g. `EMP-014`)
for cross-referencing against the roster database — Notion relation
properties aren't used here to keep the sync a plain property-fill with no
dependency on page creation order between databases.

Then create a Notion internal integration (Notion → **Settings → Connections
→ Develop or manage integrations → New integration**), copy its token, and
**share all three databases with it** (each database's `···` menu →
**Connections** → add the integration) — a token with no access to a
database gets a 404 from the Notion API indistinguishable from a wrong
database id.

## 3. Repository secrets

| Secret | Value |
|---|---|
| `NOTION_TOKEN` | The internal integration token from step 2 |
| `NOTION_ROSTER_DB_ID` | The roster database's id (from its URL) |
| `NOTION_LEAVE_DB_ID` | The leave calendar database's id (from its URL) |
| `NOTION_OVERTIME_DB_ID` | The overtime log database's id (from its URL) |

Any of the three database ids may be omitted to skip syncing that table; all
three may not be omitted at once — the workflow refuses to run with nothing
configured to sync. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (already
required for the nightly backup) are reused to read the source data — the
service role key is required because a sync run through an end-user session
would silently omit whatever RLS hides from that user.

## 4. Running it by hand

```sh
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
NOTION_TOKEN=secret_... \
NOTION_ROSTER_DB_ID=... \
NOTION_LEAVE_DB_ID=... \
NOTION_OVERTIME_DB_ID=... \
node scripts/sync-notion.mjs
```

Or trigger the workflow from the Actions tab (`workflow_dispatch`).

## 5. Limitations

- **Not real-time.** Nightly only; Notion will lag same-day changes by up to
  24 hours. If that is not good enough, this is the wrong mechanism —
  consider the Slack alert (`docs/MONITORING.md` §6) for anything that needs
  to be seen immediately.
- **No deletes.** An employee or leave/overtime request removed from the
  portal is not removed from Notion by this script. Archive it there by
  hand, or extend the script deliberately if this becomes a recurring need.
- **JSONB fields are stringified, not structured.** `Achievements (JSON)`
  and its siblings are one text blob per employee, not individually
  queryable/filterable Notion properties — fine for "look this person up and
  read it," not for "show me everyone with an open warning" as a Notion
  view. Model those as real properties if that becomes a need.
- **The existing-page lookup runs once per database, not once per row** —
  see the comment on `fetchExistingPages()` in `scripts/sync-notion.mjs` —
  so the throttle described below is the only per-call cost, not doubled by
  a query-then-write pair.
- **Rate limiting is a fixed delay, not backoff.** `scripts/sync-notion.mjs`
  waits a fixed ~350ms between Notion API calls rather than reading Notion's
  rate-limit headers. Fine at the row counts an internal ops portal produces;
  revisit if that changes enough for a nightly run to take an uncomfortably
  long time.
