#!/usr/bin/env node
//
// Restore a backup produced by scripts/backup-supabase.mjs.
//
// A backup nobody has restored is a hope, not a plan. This is the other half,
// and docs/BACKUP_RESTORE.md asks for it to be exercised against a scratch
// project each quarter — the restore that has never been run is the one that
// fails on the day.
//
// USAGE
//   # Always dry-run first. This is the default.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/restore-supabase.mjs backups/2026-08-10T09-00-00-000Z
//
//   # Then, deliberately:
//   ... node scripts/restore-supabase.mjs <dir> --execute
//
// SAFETY
//   * Dry run by default. --execute is required to write anything.
//   * Refuses to run against a URL that is not --confirm-target'd, so a
//     restore aimed at a scratch project cannot land on production because a
//     shell variable was still set from an earlier command.
//   * Upserts rather than truncating: a restore into a live project repairs
//     missing rows without destroying newer ones. Use --replace only when
//     restoring into an empty project.
//
// ORDER
// employees first — every other table references emp_id. Within the run each
// table is written in pages, since PostgREST will reject an unbounded body.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TABLES } from "./backup-supabase.mjs";

const PAGE_SIZE = 500;

/** Conflict target per table, so an upsert updates rather than duplicating. */
const CONFLICT_TARGET = {
  push_subscriptions: "endpoint",
  approved_team_logins: "email",
};

// Tables this script deliberately does not write back.
//
// audit_log and profile_unlock_audit are append-only by design: no role holds
// INSERT on them, and the SECURITY DEFINER triggers are the only writers. A
// restore therefore cannot repopulate them through PostgREST even with the
// service role, because the grant does not exist. They are backed up (so the
// history survives), and restoring them is a documented manual step using the
// SQL editor. Attempting it here would fail confusingly mid-run.
//
// client_errors is restorable in principle but must not be restored this way:
// trg_stamp_client_error fires BEFORE INSERT and overwrites emp_id, email,
// role and occurred_at from the *current* session. Replaying a backup through
// it would stamp every historical error with today's timestamp and the
// restoring operator's identity — turning the telemetry into confident
// fiction. It is telemetry, not a record anyone is required to keep (see
// docs/MONITORING.md §5), so the right call is to let it start empty.
const NOT_RESTORABLE = new Set([
  "audit_log",
  "profile_unlock_audit",
  "client_errors",
]);

function parseArgs(argv) {
  const args = { dir: null, execute: false, replace: false, confirmTarget: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") args.execute = true;
    else if (a === "--replace") args.replace = true;
    else if (a === "--confirm-target") args.confirmTarget = argv[++i];
    else if (!a.startsWith("--")) args.dir = a;
  }
  return args;
}

async function writePage(url, key, table, rows, { replace }) {
  const conflict = CONFLICT_TARGET[table] || "id";
  const endpoint = `${url}/rest/v1/${table}`
    + (replace ? "" : `?on_conflict=${encodeURIComponent(conflict)}`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // merge-duplicates makes this an upsert; without it a row that already
      // exists aborts the whole page.
      Prefer: replace ? "return=minimal" : "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    throw new Error(`${table}: HTTP ${res.status} ${(await res.text()).slice(0, 400)}`);
  }
}

export async function restore({ url, key, dir, execute = false, replace = false, confirmTarget = null }) {
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set");
  }
  if (!dir || !existsSync(dir)) {
    const hint = existsSync("backups")
      ? `\nAvailable: ${readdirSync("backups").join(", ")}`
      : "";
    throw new Error(`Backup directory not found: ${dir}${hint}`);
  }

  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `${dir} has no manifest.json — it was not produced by backup-supabase.mjs. `
      + "Restoring an unverified dump into a live project is how a partial "
      + "backup becomes a partial database."
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  console.log(`[restore] backup taken ${manifest.takenAt}`);
  console.log(`[restore] from ${manifest.source}`);
  console.log(`[restore] into ${url}`);
  if (manifest.gitRevision) console.log(`[restore] schema revision ${manifest.gitRevision}`);

  // The guard that matters. A restore is usually run under pressure, often
  // with a shell that still has production credentials exported from an
  // earlier command.
  if (execute && confirmTarget !== url) {
    throw new Error(
      "Refusing to write without an explicit target confirmation.\n"
      + `Re-run with:  --confirm-target ${url}\n`
      + "This exists because a restore is normally run under pressure, in a "
      + "shell that may still hold credentials for a different project."
    );
  }

  const results = {};
  for (const table of TABLES) {
    const file = join(dir, `${table}.json`);
    if (!existsSync(file)) continue;

    const rows = JSON.parse(readFileSync(file, "utf8"));
    if (!rows.length) { results[table] = 0; continue; }

    if (NOT_RESTORABLE.has(table)) {
      console.log(
        `[restore] ${table.padEnd(22)} ${String(rows.length).padStart(6)} rows `
        + "- SKIPPED (append-only; see docs/BACKUP_RESTORE.md)"
      );
      results[table] = "skipped";
      continue;
    }

    if (!execute) {
      console.log(`[restore] ${table.padEnd(22)} ${String(rows.length).padStart(6)} rows (dry run)`);
      results[table] = rows.length;
      continue;
    }

    for (let i = 0; i < rows.length; i += PAGE_SIZE) {
      await writePage(url, key, table, rows.slice(i, i + PAGE_SIZE), { replace });
    }
    console.log(`[restore] ${table.padEnd(22)} ${String(rows.length).padStart(6)} rows written`);
    results[table] = rows.length;
  }

  if (!execute) {
    console.log(
      "\n[restore] DRY RUN — nothing was written.\n"
      + `          To apply: --execute --confirm-target ${url}`
    );
  } else {
    console.log(
      "\n[restore] Done. Auth users are NOT restored by this script — members "
      + "sign in and set a password through the normal flow.\n"
      + "          See docs/BACKUP_RESTORE.md for the remaining steps."
    );
  }

  return results;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const args = parseArgs(process.argv.slice(2));
  restore({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ...args,
  }).catch(e => {
    console.error("[restore] FAILED:", e.message);
    process.exit(1);
  });
}
