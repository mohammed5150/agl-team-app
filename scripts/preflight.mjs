// Run this with `node scripts/preflight.mjs`. No `#!` line on purpose — see
// scripts/backup-supabase.mjs: a shebang plus a CRLF checkout makes the file
// unparseable to any vitest suite that imports it.
//
// Go-live preflight. Answers one question: is this deployment actually safe to
// hand to the team?
//
// WHY THIS EXISTS
// The go-live checklist in the README is a list of things to remember, and
// three of its items live in the Supabase dashboard where no migration can set
// them. "Did someone set the password minimum?" was answerable only by a human
// opening a browser and looking. That is exactly the kind of step that gets
// skipped once and then silently stays skipped.
//
// This checks everything that CAN be checked from outside, using the
// PUBLISHABLE key only — no service-role key, so it is safe to run anywhere,
// including CI and a developer laptop. Several checks are deliberately
// NEGATIVE: they confirm an anonymous caller is REFUSED, which is the property
// that actually protects the roster.
//
// USAGE
//   node scripts/preflight.mjs                       # uses src/supabasePortal.js
//   SUPABASE_URL=... SUPABASE_KEY=... node scripts/preflight.mjs
//   PORTAL_URL=https://... node scripts/preflight.mjs   # also check the site
//
// Exit code 0 = every automated check passed. 1 = something is wrong.
// Manual items are always listed and never pass or fail on their own — see
// the note at the end about why.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Read the deployed project URL and publishable key out of the app source. */
function credsFromSource() {
  const src = readFileSync(join(ROOT, "src/supabasePortal.js"), "utf8");
  const url = src.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)?.[1];
  const key = src.match(/SUPABASE_KEY\s*=\s*"([^"]+)"/)?.[1];
  return { url, key };
}

const fromSource = credsFromSource();
const URL_ = process.env.SUPABASE_URL || fromSource.url;
const KEY  = process.env.SUPABASE_KEY || fromSource.key;
const PORTAL = process.env.PORTAL_URL || "";

const results = [];
const record = (ok, name, detail) => {
  results.push({ ok, name, detail });
  const mark = ok ? "[32mPASS[39m" : "[31mFAIL[39m";
  console.log(`  ${mark}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

async function rest(path, opts = {}) {
  return fetch(`${URL_}${path}`, {
    ...opts,
    headers: { apikey: KEY, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
}

/**
 * Is this response actually from PostgREST, rather than from something in the
 * middle?
 *
 * This distinction is load-bearing. The first version of this script treated
 * ANY non-ok response as "RLS is holding" — so behind a corporate proxy that
 * 403s every request, it cheerfully reported seven passing security checks
 * against a database it had never reached. A check that cannot fail is worse
 * than no check, because it manufactures confidence. PostgREST always answers
 * JSON with a `message` or `code`; a proxy or gateway answers HTML or nothing.
 */
async function isPostgrestResponse(res) {
  const type = res.headers.get("content-type") || "";
  if (!type.includes("json")) return false;
  try {
    const body = await res.clone().json();
    return body && typeof body === "object";
  } catch {
    return false;
  }
}

/**
 * An anonymous caller must not be able to read this table. A 200 with rows is
 * the failure that matters most in this whole file: it means the roster is
 * readable by anyone holding the publishable key, which is in the bundle.
 */
async function mustDenyAnon(table) {
  let res;
  try {
    res = await rest(`/rest/v1/${table}?select=*&limit=1`);
  } catch (e) {
    return { ok: false, detail: `could not reach the API: ${e.message}` };
  }

  if (res.ok) {
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length === 0) {
      return { ok: true, detail: "returned no rows (RLS holding)" };
    }
    return {
      ok: false,
      detail: `READABLE ANONYMOUSLY — ${rows.length} row(s) came back. `
            + "The publishable key is in the public bundle, so this is a data leak.",
    };
  }

  // Refused — but by the database, or by something in between?
  if (await isPostgrestResponse(res)) {
    return { ok: true, detail: `refused by the database (HTTP ${res.status})` };
  }
  return {
    ok: false,
    detail: `HTTP ${res.status} did not come from PostgREST — a proxy or gateway `
          + "blocked the request, so this check proved nothing. Run it from a "
          + "network that can reach Supabase directly.",
  };
}

console.log("\nAGL Team Portal — go-live preflight");
console.log(`Project: ${URL_}\n`);

if (!URL_ || !KEY) {
  console.error("Could not determine SUPABASE_URL / SUPABASE_KEY.");
  process.exit(1);
}

// ---------------------------------------------------------------
console.log("Database reachable");
//
// This gates everything below. If we cannot reach PostgREST, no later check
// can distinguish "the database refused me" from "I never got there" — and
// reporting security checks as passing in that state is how a broken
// deployment gets waved through.
// ---------------------------------------------------------------
{
  let reachable = false;
  let detail = "";
  try {
    const res = await rest("/rest/v1/");
    // 200/401/404 all prove PostgREST is answering. A paused project does not.
    const fromDb = [200, 401, 404].includes(res.status);
    reachable = fromDb;
    detail = `HTTP ${res.status}`;
    if (res.status >= 500) detail += " — the project may be paused";
    if (!fromDb && res.status === 403) {
      detail += " — likely a proxy or network policy, not Supabase";
    }
  } catch (e) {
    detail = `unreachable: ${e.message}`;
  }
  record(reachable, "project is awake and answering", detail);

  if (!reachable) {
    console.log(`
[31mAborting.[39m Every remaining check would be meaningless against a database
this script never reached — and several of them would report PASS, because
"refused" and "never arrived" look identical from here.

Run this from a machine that can reach ${URL_} directly.
`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------
console.log("\nRLS holds against an anonymous caller");
// ---------------------------------------------------------------
for (const table of ["employees", "leave_requests", "overtime_requests",
                     "notifications", "audit_log", "client_errors",
                     "approved_team_logins"]) {
  const r = await mustDenyAnon(table);
  record(r.ok, `${table} is not anonymously readable`, r.detail);
}

// ---------------------------------------------------------------
console.log("\nLogin gate");
// ---------------------------------------------------------------
// Production bundles carry no local directory, so if this RPC is missing or
// broken NOBODY can sign in. It must answer, and it must refuse an unknown
// address. We only ever send an address that is definitely not a real person.
try {
  const res = await rest("/rest/v1/rpc/is_approved_team_login", {
    method: "POST",
    body: JSON.stringify({ p_email: "definitely-not-a-team-member@example.invalid" }),
  });
  if (!res.ok) {
    record(false, "is_approved_team_login is callable anonymously",
      `HTTP ${res.status} — sign-in would fail for everyone. `
      + "Check supabase_team_onboarding.sql has been applied.");
  } else {
    const v = await res.json();
    record(v === false, "login gate refuses an unknown address",
      v === false ? "returned false, as it should" : `returned ${JSON.stringify(v)} — expected false`);
  }
} catch (e) {
  record(false, "login gate reachable", e.message);
}

// ---------------------------------------------------------------
console.log("\nSchema is at the revision the code expects");
// ---------------------------------------------------------------
// Each of these is a table or column the deployed front end reads or writes.
// A missing one means a migration was skipped, and the symptom in the app is
// usually a confusing partial failure rather than an obvious error.
const REQUIRED_OBJECTS = [
  ["audit_log", "the Audit Trail page reads this (supabase_audit_log.sql)"],
  ["client_errors", "error reporting writes here (supabase_monitoring.sql)"],
];
for (const [table, why] of REQUIRED_OBJECTS) {
  try {
    const res = await rest(`/rest/v1/${table}?select=*&limit=1`);
    // 404 / PGRST205 means the table does not exist. 200 or 401 means it does.
    const body = res.ok ? "" : await res.text();
    const missing = res.status === 404 || /does not exist|Could not find the table/i.test(body);
    record(!missing, `${table} exists`, missing ? `MISSING — ${why}` : why);
  } catch (e) {
    record(false, `${table} exists`, e.message);
  }
}

// employment_status is added by supabase_security_v2.sql. Without it, a
// manager invite fails, because an insert sends the whole employee row.
try {
  const res = await rest("/rest/v1/employees?select=employment_status&limit=1");
  const body = res.ok ? "" : await res.text();
  const missing = /employment_status/.test(body) && /does not exist|column/i.test(body);
  record(!missing, "employees.employment_status exists",
    missing
      ? "MISSING — manager invites will fail (supabase_security_v2.sql)"
      : "offboarding column present");
} catch (e) {
  record(false, "employees.employment_status exists", e.message);
}

// ---------------------------------------------------------------
if (PORTAL) {
  console.log("\nDeployed site");
  try {
    const res = await fetch(PORTAL);
    const html = await res.text();
    record(res.ok && html.includes('id="root"'), "portal serves the app shell",
      `HTTP ${res.status}`);

    const js = await (await fetch(`${PORTAL.replace(/\/$/, "")}/app.js`)).text();
    const emails = [...new Set(js.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])]
      .filter(e => !["your.name@adbsafegate.com", "someone@adbsafegate.com",
                     "john.doe@adbsafegate.com", "jane.smith@gmail.com"].includes(e.toLowerCase()));
    record(emails.length === 0, "live bundle carries no personal addresses",
      emails.length ? `${emails.length} found: ${emails.slice(0, 5).join(", ")}` : "clean");
    record(!js.includes("DEV: PREFILL EMAIL"), "live bundle is not a demo build");
  } catch (e) {
    record(false, "deployed site reachable", e.message);
  }
} else {
  console.log("\nDeployed site");
  console.log("  SKIP  set PORTAL_URL to also check the live bundle");
}

// ---------------------------------------------------------------
// Manual items.
//
// These are NOT checks. Supabase's auth configuration is not exposed through
// the database or the REST API, so nothing here can read it — and a check that
// silently always passes is worse than no check, because it manufactures
// confidence. They are printed every run so they stay visible.
// ---------------------------------------------------------------
console.log("\n[33mMUST BE CONFIRMED BY HAND[39m (not readable from outside — see docs/SECURITY.md §6)");
console.log(`
  [ ] Auth > Policies > minimum password length = 12
        Otherwise the real floor is Supabase's default of 6 and
        src/passwordPolicy.js is decorative.

  [ ] Auth > Policies > leaked password protection = on
        The one control the policy file cannot provide.

  [ ] Auth > URL Configuration > deployed URL present in Redirect URLs
        Password reset links silently do not work without it.
        Test it: use "Forgot your password?" and click the emailed link.

  [ ] Repository secrets SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
        Without them there are no backups and no uptime alerts.
        Verify by running the "Nightly Supabase backup" workflow by hand.
`);

// ---------------------------------------------------------------
const failed = results.filter(r => !r.ok);
console.log("-".repeat(64));
if (failed.length) {
  console.log(`[31m${failed.length} of ${results.length} automated checks FAILED[39m`);
  for (const f of failed) console.log(`  - ${f.name}`);
  console.log("\nDo not hand this to the team until these pass.\n");
  process.exit(1);
}
console.log(`[32mAll ${results.length} automated checks passed.[39m`);
console.log("The four manual items above still need a human. They are the ones");
console.log("that cannot be verified from here, not the ones that matter least.\n");
