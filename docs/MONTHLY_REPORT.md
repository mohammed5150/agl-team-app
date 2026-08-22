# Month-end report

A full-detail Excel workbook — the current roster, plus that month's leave
and overtime activity — uploaded to Google Drive on the 1st of each month.
Where the nightly backup (`docs/BACKUP_RESTORE.md`) exists so the portal's
data can be *recovered*, this exists so a specific month's activity can be
*proven* to someone who will never open Supabase — an auditor, a client, a
dispute over a leave or overtime decision raised months later. Runs via
`.github/workflows/monthly-report.yml` → `scripts/monthly-report.mjs`. Off by
default: with no Google secrets configured, the workflow fails loudly at its
secrets-check step rather than "succeeding" while doing nothing.

## 1. What's in the workbook

Three sheets, full detail (see `docs/NOTION_SYNC.md` "Why full detail" for
the same reasoning applied here — a compliance record with fields redacted
isn't proof of anything):

- **Roster (current)** — every column on `employees` except the JSONB ones
  (see below), as of the day the report ran. Not filtered to the month —
  there's no "roster as it looked on day N" without a snapshot table this
  portal doesn't keep, so this is always current state.
- **Leave `<month>`** — every leave request applied for *or* starting in the
  target month, every column on `leave_requests` including `reason` and both
  comment fields.
- **Overtime `<month>`** — every overtime request applied for *or* worked in
  the target month, every column on `overtime_requests`.

**Not included:** `achievements`, `warnings`, `actions`, `training`,
`roster` and `documents` — the JSONB columns on `employees`. They're nested
structures with no natural spreadsheet-column shape; the Notion sync
stringifies these into text, but a compliance workbook that's supposed to be
readable by a non-technical auditor shouldn't hand them a wall of JSON. If a
future audit genuinely needs achievement/warning history, that's worth a
dedicated sheet built from the structure deliberately, not a JSON dump
added here.

## 2. Google-side setup

1. **Create a service account.** Google Cloud Console → IAM & Admin →
   Service Accounts → Create. No project roles are needed — this script only
   talks to Drive, and only to a folder explicitly shared with it (see
   step 3).
2. **Create a key for it.** That service account → Keys → Add key → Create
   new key → JSON. Download the file — this is `GOOGLE_SERVICE_ACCOUNT_KEY`
   (the whole JSON file's contents, as one secret).
3. **Create a Drive folder and share it with the service account.** In
   Google Drive, create (or pick) a folder, then **Share** it with the
   service account's email (looks like
   `name@project-id.iam.gserviceaccount.com`, found in the JSON key or the
   Cloud Console) as an **Editor**. A service account has no Drive content of
   its own — this share is the only thing that gives it anywhere to write.
4. **Copy the folder's id** from its URL
   (`drive.google.com/drive/folders/`**`THIS PART`**) — this is
   `GOOGLE_DRIVE_FOLDER_ID`.

## 3. Repository secrets

| Secret | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | The full JSON key file's contents, from step 2 |
| `GOOGLE_DRIVE_FOLDER_ID` | The shared folder's id, from step 4 |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (already required for the
nightly backup) are reused to read the source data — the service role key is
required because a report generated through an end-user session would
silently omit whatever RLS hides from that user, and a compliance record
that quietly under-reports is worse than none.

## 4. Running it by hand

```sh
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}' \
GOOGLE_DRIVE_FOLDER_ID=... \
node scripts/monthly-report.mjs --month 2026-07
```

Or trigger the workflow from the Actions tab (`workflow_dispatch`), with an
optional `month` input (`YYYY-MM`) to re-run an earlier month — leave it
blank to report on last month, matching the scheduled run.

## 5. Re-runs are safe

Uploading is an upsert by filename (`AGL-Portal-Report-YYYY-MM.xlsx`) — the
script looks for an existing file with that name in the target folder and
overwrites it rather than creating a duplicate. Re-running the same month by
hand (to pick up a correction made after the 1st, for instance) replaces
that month's file, it doesn't pile up copies.

## 6. Limitations

- **Snapshot, not a ledger.** The roster sheet is always "as of today" —
  running the report late, or re-running an old month, gives you that
  month's leave/overtime activity against the *current* roster, not the
  roster as it existed back then. If a dispute genuinely needs "who was on
  the roster, with what tier, in March" as opposed to "what leave/overtime
  happened in March," that needs a roster snapshot mechanism this portal
  doesn't have yet.
- **No email/notification when it runs.** Unlike the nightly backup and
  Notion sync, nothing currently posts to Slack when this succeeds or fails
  — check the Actions tab, or add a `sendSlack()` call to the workflow if
  that's needed, matching the pattern in `docs/MONITORING.md` §6.
- **Full Drive scope, not `drive.file`.** The service account requests the
  broad `https://www.googleapis.com/auth/drive` OAuth scope rather than the
  narrower `drive.file` scope, because `drive.file` has had inconsistent
  behavior letting a service account find files it didn't itself create —
  needed here to overwrite last month's file on a re-run. In practice this
  is still scoped tightly: a service account has no Drive content of its
  own, so the broad scope only ever reaches folders a human has explicitly
  shared with it (step 3) — but it's still broader than the minimum a
  perfectly scoped integration would use. Worth revisiting if this service
  account is ever shared additional folders for an unrelated purpose.
