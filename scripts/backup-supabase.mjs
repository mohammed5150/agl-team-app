#!/usr/bin/env node
//
// Logical backup of every portal table to a timestamped JSON directory.
//
// WHY THIS EXISTS
// The portal's entire record — roster, leave history, overtime, ratings,
// warnings, audit trail — lives in one Supabase project, and there was no
// answer to "what happens if that project is lost". Supabase's own PITR is
// the first line of defence, but it is scoped to the project: it does not
// help against the project being deleted, a billing lapse, an account
// compromise, or a mistaken migration applied months ago that nobody caught.
// This produces an export that lives somewhere else entirely and that can be
// read without Supabase.
//
// WHAT IT IS NOT
// This is a LOGICAL backup of table contents. It does NOT capture:
//   - Supabase Auth users or password hashes (auth.users is not reachable
//     through PostgREST; those are restored by re-inviting, and the portal's
//     sign-up flow already handles a member setting a new password)
//   - schema, policies, triggers, or functions (those are the supabase_*.sql
//     files in this repository, which IS their backup)
//   - storage buckets (the portal stores no files in Supabase Storage today)
// docs/BACKUP_RESTORE.md sets out what a full recovery involves.
//
// USAGE
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/backup-supabase.mjs [--out backups] [--tables a,b]
//
// The service role key bypasses RLS, which is the point — a backup taken
// through an end-user session would silently omit every row that user cannot
// see, and restore a truncated roster. Never expose that key to the browser
// or commit it; in CI it belongs in an encrypted secret.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Order matters on restore: employees before anything referencing emp_id.
export const TABLES = [
  "employees",
  "leave_requests",
  "overtime_requests",
  "announcements",
  "notifications",
  "push_subscriptions",
  "approved_team_logins",
  "profile_unlock_audit",
  "audit_log",
];

/** Tables whose absence is normal — optional migrations, not an error. */
const OPTIONAL = new Set([
  "overtime_requests",
  "push_subscriptions",
  "approved_team_logins",
  "profile_unlock_audit",
  "audit_log",
]);

const PAGE_SIZE = 1000;

function parseArgs(argv) {
  const args = { out: "backups", tables: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--tables") args.tables = argv[++i].split(",").map(s => s.trim());
  }
  return args;
}

/**
 * Read one table completely, in pages.
 *
 * PostgREST caps a response at 1000 rows by default, so a single unpaged GET
 * on a growing audit_log would silently return a prefix and call it a backup.
 * Ordering by the primary key makes the paging stable.
 */
async function fetchAll(url, key, table, orderBy) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const endpoint = `${url}/rest/v1/${table}`
      + `?select=*&order=${encodeURIComponent(orderBy)}`
      + `&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`${table}: HTTP ${res.status} ${body.slice(0, 300)}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Primary key to order by, so paging is deterministic per table. */
function orderColumn(table) {
  if (table === "push_subscriptions") return "endpoint";
  if (table === "approved_team_logins") return "email";
  return "id";
}

export async function backup({ url, key, out, tables = TABLES, now = new Date() }) {
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.\n"
      + "The service role key is required: a backup taken through an end-user\n"
      + "session would omit every row RLS hides from that user."
    );
  }

  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const dir = join(out, stamp);
  mkdirSync(dir, { recursive: true });

  const manifest = {
    takenAt: now.toISOString(),
    source: url,
    tables: {},
    skipped: {},
    // Recorded so a restore can tell which schema the data came from.
    migrations: "see supabase_*.sql at the repository revision noted below",
    gitRevision: process.env.GITHUB_SHA || process.env.GIT_REVISION || null,
  };

  for (const table of tables) {
    try {
      const rows = await fetchAll(url, key, table, orderColumn(table));
      writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 2));
      manifest.tables[table] = rows.length;
      console.log(`[backup] ${table.padEnd(22)} ${String(rows.length).padStart(6)} rows`);
    } catch (e) {
      // A missing optional table is expected; anything else must fail the run,
      // or a "successful" backup quietly loses a table.
      const missing = e.status === 404
        || /does not exist|could not find the table/i.test(e.body || e.message || "");
      if (missing && OPTIONAL.has(table)) {
        manifest.skipped[table] = "not present in this project";
        console.log(`[backup] ${table.padEnd(22)}      – not present, skipped`);
        continue;
      }
      throw e;
    }
  }

  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

  const total = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
  console.log(`\n[backup] ${total} rows across ${Object.keys(manifest.tables).length} tables -> ${dir}`);

  // A backup of nothing is the failure this is most likely to hide: a wrong
  // key, a paused project, or a URL pointing somewhere empty all produce zero
  // rows and exit 0 unless something checks.
  if (total === 0) {
    throw new Error(
      "Backup contains no rows at all. That is almost certainly a wrong "
      + "SUPABASE_URL, a wrong key, or a paused project — not an empty portal."
    );
  }

  return { dir, manifest };
}

// Run only when invoked directly, so the functions above stay importable.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const args = parseArgs(process.argv.slice(2));
  backup({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    out: args.out,
    tables: args.tables || TABLES,
  }).catch(e => {
    console.error("[backup] FAILED:", e.message);
    process.exit(1);
  });
}
