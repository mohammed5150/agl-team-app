#!/usr/bin/env node
//
// Nightly export of the roster, leave calendar and overtime log to Notion
// databases, for visibility outside the portal without giving Notion — or
// anyone with access to it — a login to Supabase.
//
// FULL DETAIL, BY DELIBERATE REQUEST
// Earlier revisions of this script exported a narrow, non-PII summary —
// Notion is a third party outside the portal's RLS and CSP boundary, and an
// HR portal's full rows carry employee identifiers, document numbers and
// free-text fields that can contain medical or personal detail (the same
// reasoning documented in supabase_monitoring.sql for not adopting Sentry).
// That scoping was deliberately reversed: every column in `employees`,
// `leave_requests` and `overtime_requests` is now synced, including email,
// mobile, DOB, address, passport/visa/Emirates ID numbers, and every
// free-text reason/comment field. This is an accepted, explicit tradeoff —
// see docs/NOTION_SYNC.md "Why full detail" before reversing it again or
// widening who has access to the Notion databases it writes to.
// JSONB columns (achievements, warnings, actions, training, roster,
// documents) don't map to a Notion property type, so they're serialized to
// JSON text — see `jsonText()` below.
//
// UPSERT
// Each Notion database must already exist with the properties this script
// writes (see docs/NOTION_SYNC.md for the exact property list and types —
// Notion's API cannot infer a schema, only fill one that exists). Every row
// is matched by its portal id (the database's title property) and either
// updated in place or created; nothing is ever deleted from Notion by this
// script; retire the exception in whatever way it needs.
//
// USAGE
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   NOTION_TOKEN=secret_... \
//   NOTION_ROSTER_DB_ID=... \
//   NOTION_LEAVE_DB_ID=... \
//   NOTION_OVERTIME_DB_ID=... \
//   node scripts/sync-notion.mjs
//
// The service role key bypasses RLS — same reasoning as backup-supabase.mjs:
// a sync run through an end-user session would silently omit rows that user
// cannot see. Never expose it to the browser or commit it.

import { fetchAllRows } from "./lib/supabaseTable.mjs";

const NOTION_VERSION = "2022-06-28";

// Minimum gap between Notion API calls. Notion's documented average rate
// limit is ~3 requests/second; this keeps a roster of a few hundred well
// clear of it without needing retry/backoff plumbing for a nightly job.
const NOTION_THROTTLE_MS = 350;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function notionHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

/**
 * Every existing page in `databaseId`, keyed by its title-property text
 * (the portal id). Fetched once per sync, up front, so upserting N rows costs
 * N Notion calls instead of 2N — a per-row "does this page exist" query
 * before every write would double the nightly run's time against Notion's
 * ~3 req/sec ceiling for no reason: the whole database fits in a handful of
 * paginated queries.
 */
async function fetchExistingPages(token, databaseId, titleProperty) {
  const byPortalId = new Map();
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`query ${databaseId}: HTTP ${res.status} ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    for (const page of data.results) {
      const title = page.properties?.[titleProperty]?.title?.[0]?.plain_text;
      if (title) byPortalId.set(title, page.id);
    }
    cursor = data.has_more ? data.next_cursor : undefined;
    await sleep(NOTION_THROTTLE_MS);
  } while (cursor);
  return byPortalId;
}

async function upsertPage(token, databaseId, existingPageId, titleProperty, portalId, properties) {
  const body = { properties: { [titleProperty]: { title: [{ text: { content: portalId } }] }, ...properties } };
  const endpoint = existingPageId
    ? `https://api.notion.com/v1/pages/${existingPageId}`
    : `https://api.notion.com/v1/pages`;
  const res = await fetch(endpoint, {
    method: existingPageId ? "PATCH" : "POST",
    headers: notionHeaders(token),
    body: JSON.stringify(existingPageId ? body : { parent: { database_id: databaseId }, ...body }),
  });
  await sleep(NOTION_THROTTLE_MS);
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`upsert ${portalId} into ${databaseId}: HTTP ${res.status} ${errBody.slice(0, 300)}`);
  }
  return existingPageId ? "updated" : "created";
}

const richText = value => ({ rich_text: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [] });
const select = value => ({ select: value ? { name: String(value) } : null });
const number = value => ({ number: value === null || value === undefined ? null : Number(value) });
const date = value => ({ date: value ? { start: value } : null });
// JSONB columns have no Notion property equivalent — stringify, Notion's
// rich_text limit (2000 chars/block) truncates the rest via richText() above.
const jsonText = value => richText(value == null ? "" : JSON.stringify(value));

function rosterProperties(emp) {
  return {
    "Name":                    richText(emp.name),
    "Email":                   richText(emp.email),
    "Section":                 richText(emp.section),
    "Designation":             richText(emp.designation),
    "Shift":                   richText(emp.shift),
    "Role":                    select(emp.role),
    "Nationality":             richText(emp.nationality),
    "Mobile":                  richText(emp.mobile),
    "Employee No":             richText(emp.emp_no),
    "DOB":                     date(emp.dob),
    "Marital Status":          richText(emp.marital_status),
    "Address":                 richText(emp.address),
    "Join Date":               date(emp.join_date),
    "Emergency Contact Name":  richText(emp.emergency_name),
    "Emergency Contact No":    richText(emp.emergency_contact),
    "Passport No":             richText(emp.passport_no),
    "Passport Expiry":         date(emp.passport_expiry),
    "Visa Expiry":             date(emp.visa_expiry),
    "Emirates ID No":          richText(emp.eid_no),
    "Emirates ID Expiry":      date(emp.eid_expiry),
    "Tier":                    select(emp.tier),
    "Band":                    select(emp.band),
    "Airport":                 richText(emp.airport),
    "Supplier":                richText(emp.supplier),
    "Employment Status":       select(emp.employment_status),
    "Annual Leave":            number(emp.annual_leave),
    "Annual Leave Used":       number(emp.used_annual),
    "Sick Leave":              number(emp.sick_leave),
    "Sick Leave Used":         number(emp.used_sick),
    "Comp Off":                number(emp.comp_off),
    "Achievements (JSON)":     jsonText(emp.achievements),
    "Warnings (JSON)":         jsonText(emp.warnings),
    "Actions (JSON)":          jsonText(emp.actions),
    "Training (JSON)":         jsonText(emp.training),
  };
}

function leaveProperties(lr) {
  return {
    "Employee":        richText(lr.emp_name),
    "Employee ID Ref": richText(lr.emp_id),
    "Section":         richText(lr.section),
    "Type":            select(lr.type),
    "Start Date":      date(lr.start_date),
    "End Date":        date(lr.end_date),
    "Days":            number(lr.days),
    "Reason":          richText(lr.reason),
    "Status":          select(lr.status),
    "Applied On":      date(lr.applied_on),
    "TL Comment":      richText(lr.tl_comment),
    "Mgr Comment":     richText(lr.mgr_comment),
    "TL Action Date":  date(lr.tl_action_date),
    "Mgr Action Date": date(lr.mgr_action_date),
    "TL Name":         richText(lr.tl_name),
    "Mgr Name":        richText(lr.mgr_name),
  };
}

function overtimeProperties(ot) {
  return {
    "Employee":        richText(ot.emp_name),
    "Employee ID Ref": richText(ot.emp_id),
    "Section":         richText(ot.section),
    "Work Date":       date(ot.work_date),
    "Hours":           number(ot.hours),
    "Reason":          richText(ot.reason),
    "Status":          select(ot.status),
    "Applied On":      date(ot.applied_on),
    "TL Comment":      richText(ot.tl_comment),
    "TL Action Date":  date(ot.tl_action_date),
    "TL Name":         richText(ot.tl_name),
    "Comp Off Days":   number(ot.comp_off_days),
  };
}

async function syncTable({ notionToken, databaseId, rows, propsFor, label }) {
  if (!databaseId) {
    console.log(`[notion-sync] ${label}: no database id configured, skipped`);
    return { created: 0, updated: 0, skipped: rows.length };
  }
  const existingPages = await fetchExistingPages(notionToken, databaseId, "Employee ID");
  let created = 0, updated = 0;
  for (const row of rows) {
    const portalId = String(row.id);
    const outcome = await upsertPage(
      notionToken, databaseId, existingPages.get(portalId), "Employee ID", portalId, propsFor(row),
    );
    if (outcome === "created") created++; else updated++;
  }
  console.log(`[notion-sync] ${label}: ${created} created, ${updated} updated (${rows.length} total)`);
  return { created, updated, skipped: 0 };
}

export async function syncNotion({
  supabaseUrl, supabaseKey, notionToken, rosterDbId, leaveDbId, overtimeDbId,
}) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.");
  }
  if (!notionToken) {
    throw new Error("NOTION_TOKEN must be set.");
  }
  if (!rosterDbId && !leaveDbId && !overtimeDbId) {
    throw new Error("At least one of NOTION_ROSTER_DB_ID / NOTION_LEAVE_DB_ID / "
      + "NOTION_OVERTIME_DB_ID must be set — nothing to sync otherwise.");
  }

  const employees = await fetchAllRows(supabaseUrl, supabaseKey, "employees", "id");
  const leaveRequests = await fetchAllRows(supabaseUrl, supabaseKey, "leave_requests", "id");
  const overtimeRequests = await fetchAllRows(supabaseUrl, supabaseKey, "overtime_requests", "id");

  const roster = await syncTable({
    notionToken, databaseId: rosterDbId, rows: employees, propsFor: rosterProperties, label: "roster",
  });
  const leave = await syncTable({
    notionToken, databaseId: leaveDbId, rows: leaveRequests, propsFor: leaveProperties, label: "leave",
  });
  const overtime = await syncTable({
    notionToken, databaseId: overtimeDbId, rows: overtimeRequests, propsFor: overtimeProperties, label: "overtime",
  });

  return { roster, leave, overtime };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  syncNotion({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    notionToken: process.env.NOTION_TOKEN,
    rosterDbId: process.env.NOTION_ROSTER_DB_ID,
    leaveDbId: process.env.NOTION_LEAVE_DB_ID,
    overtimeDbId: process.env.NOTION_OVERTIME_DB_ID,
  }).catch(e => {
    console.error("[notion-sync] FAILED:", e.message);
    process.exit(1);
  });
}
