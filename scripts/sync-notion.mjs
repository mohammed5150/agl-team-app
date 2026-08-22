#!/usr/bin/env node
//
// Nightly export of the roster and leave calendar to Notion databases, for
// visibility outside the portal (shift planning, an ops dashboard) without
// giving Notion — or anyone with access to it — a login to Supabase.
//
// WHAT IS SYNCED, AND WHAT IS DELIBERATELY NOT
// Notion is a third party the portal otherwise has no relationship with, so
// this exports a narrow, non-sensitive summary rather than the whole table —
// the same reasoning documented in supabase_monitoring.sql for not adopting
// Sentry: an HR portal's full rows carry employee identifiers, document
// numbers and free-text fields that can contain medical or personal detail.
//   Roster  -> id, name, section, designation, role, tier, band, airport,
//              supplier, employment_status, leave/sick/comp-off balances.
//   Leave   -> id, employee name, section, type, dates, days, status.
// NEVER added here: email, mobile, DOB, marital status, address, emergency
// contact, passport/visa/Emirates ID, or any free-text reason/comment field
// (leave "reason" and the tl/mgr comment columns can contain medical or
// personal detail volunteered by the employee).
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

function rosterProperties(emp) {
  return {
    "Name":              richText(emp.name),
    "Section":           richText(emp.section),
    "Designation":       richText(emp.designation),
    "Role":              select(emp.role),
    "Tier":              select(emp.tier),
    "Band":              select(emp.band),
    "Airport":           richText(emp.airport),
    "Supplier":          richText(emp.supplier),
    "Employment Status": select(emp.employment_status),
    "Annual Leave":      number(emp.annual_leave),
    "Annual Leave Used": number(emp.used_annual),
    "Sick Leave":        number(emp.sick_leave),
    "Sick Leave Used":   number(emp.used_sick),
    "Comp Off":          number(emp.comp_off),
  };
}

function leaveProperties(lr) {
  return {
    "Employee":   richText(lr.emp_name),
    "Section":    richText(lr.section),
    "Type":       select(lr.type),
    "Start Date": date(lr.start_date),
    "End Date":   date(lr.end_date),
    "Days":       number(lr.days),
    "Status":     select(lr.status),
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
  supabaseUrl, supabaseKey, notionToken, rosterDbId, leaveDbId,
}) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.");
  }
  if (!notionToken) {
    throw new Error("NOTION_TOKEN must be set.");
  }
  if (!rosterDbId && !leaveDbId) {
    throw new Error("At least one of NOTION_ROSTER_DB_ID / NOTION_LEAVE_DB_ID must be set — "
      + "nothing to sync otherwise.");
  }

  const employees = await fetchAllRows(supabaseUrl, supabaseKey, "employees", "id");
  const leaveRequests = await fetchAllRows(supabaseUrl, supabaseKey, "leave_requests", "id");

  const roster = await syncTable({
    notionToken, databaseId: rosterDbId, rows: employees, propsFor: rosterProperties, label: "roster",
  });
  const leave = await syncTable({
    notionToken, databaseId: leaveDbId, rows: leaveRequests, propsFor: leaveProperties, label: "leave",
  });

  return { roster, leave };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  syncNotion({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    notionToken: process.env.NOTION_TOKEN,
    rosterDbId: process.env.NOTION_ROSTER_DB_ID,
    leaveDbId: process.env.NOTION_LEAVE_DB_ID,
  }).catch(e => {
    console.error("[notion-sync] FAILED:", e.message);
    process.exit(1);
  });
}
