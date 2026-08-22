#!/usr/bin/env node
//
// Month-end audit/compliance export: a full-detail Excel workbook — the
// current roster, plus that month's leave and overtime activity — uploaded
// to Google Drive as a durable, reviewable record. Where the nightly backup
// (docs/BACKUP_RESTORE.md) exists so the portal's data can be RECOVERED,
// this exists so a specific month's activity can be PROVEN to someone who
// will never open Supabase — an auditor, a client, a dispute over a leave
// or overtime decision months later.
//
// WHAT IS INCLUDED
// Full detail, deliberately — the same tradeoff as the Notion sync (see
// docs/NOTION_SYNC.md "Why full detail"), for the same reason: a compliance
// record with fields redacted isn't proof of anything. Every column in
// `employees`, `leave_requests` and `overtime_requests` that this script
// knows about is written; free-text reason/comment fields included. JSONB
// columns (achievements, warnings, actions, training, roster, documents)
// are NOT included — see docs/MONTHLY_REPORT.md for why and what to do if
// that becomes a requirement.
//
// SCOPE
//   Roster sheet    — every employee, current state, as of the report date
//                      (not filtered to the month — there's no natural
//                      "roster as it was on day N" without a snapshot table
//                      this portal doesn't keep).
//   Leave sheet     — every leave request applied for OR starting within
//                      the target month.
//   Overtime sheet  — every overtime request applied for OR worked within
//                      the target month.
//
// USAGE
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}' \
//   GOOGLE_DRIVE_FOLDER_ID=... \
//   node scripts/monthly-report.mjs [--month YYYY-MM]
//
// Without --month, defaults to the PREVIOUS calendar month (UTC) — this is
// meant to run on the 1st, reporting on the month that just closed. The
// service role key bypasses RLS for the same reason backup-supabase.mjs's
// does: a report generated through an end-user session would silently omit
// whatever RLS hides from that user, and a compliance record that quietly
// under-reports is worse than no record.

import ExcelJS from "exceljs";
import { google } from "googleapis";
import { Readable } from "node:stream";
import { fetchAllRows } from "./lib/supabaseTable.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--month") args.month = argv[++i];
  }
  return args;
}

function previousMonth(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(monthStr) {
  if (!/^\d{4}-\d{2}$/.test(monthStr)) {
    throw new Error(`--month must be YYYY-MM, got "${monthStr}"`);
  }
  const [y, m] = monthStr.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

function anyDateInRange(row, fields, start, end) {
  return fields.some(f => {
    if (!row[f]) return false;
    const d = new Date(row[f]);
    return d >= start && d < end;
  });
}

const ROSTER_COLUMNS = [
  { header: "Employee ID", key: "id", width: 12 },
  { header: "Name", key: "name", width: 22 },
  { header: "Email", key: "email", width: 26 },
  { header: "Section", key: "section", width: 14 },
  { header: "Designation", key: "designation", width: 18 },
  { header: "Role", key: "role", width: 12 },
  { header: "Nationality", key: "nationality", width: 14 },
  { header: "Mobile", key: "mobile", width: 16 },
  { header: "Employee No", key: "emp_no", width: 14 },
  { header: "DOB", key: "dob", width: 12 },
  { header: "Marital Status", key: "marital_status", width: 14 },
  { header: "Address", key: "address", width: 30 },
  { header: "Join Date", key: "join_date", width: 12 },
  { header: "Emergency Contact Name", key: "emergency_name", width: 20 },
  { header: "Emergency Contact No", key: "emergency_contact", width: 18 },
  { header: "Passport No", key: "passport_no", width: 16 },
  { header: "Passport Expiry", key: "passport_expiry", width: 14 },
  { header: "Visa Expiry", key: "visa_expiry", width: 14 },
  { header: "Emirates ID No", key: "eid_no", width: 18 },
  { header: "Emirates ID Expiry", key: "eid_expiry", width: 16 },
  { header: "Tier", key: "tier", width: 8 },
  { header: "Band", key: "band", width: 8 },
  { header: "Airport", key: "airport", width: 10 },
  { header: "Supplier", key: "supplier", width: 16 },
  { header: "Employment Status", key: "employment_status", width: 14 },
  { header: "Annual Leave", key: "annual_leave", width: 12 },
  { header: "Annual Leave Used", key: "used_annual", width: 14 },
  { header: "Sick Leave", key: "sick_leave", width: 12 },
  { header: "Sick Leave Used", key: "used_sick", width: 14 },
  { header: "Comp Off", key: "comp_off", width: 10 },
];

const LEAVE_COLUMNS = [
  { header: "Request ID", key: "id", width: 12 },
  { header: "Employee ID", key: "emp_id", width: 12 },
  { header: "Employee", key: "emp_name", width: 22 },
  { header: "Section", key: "section", width: 14 },
  { header: "Type", key: "type", width: 12 },
  { header: "Start Date", key: "start_date", width: 12 },
  { header: "End Date", key: "end_date", width: 12 },
  { header: "Days", key: "days", width: 8 },
  { header: "Reason", key: "reason", width: 30 },
  { header: "Status", key: "status", width: 12 },
  { header: "Applied On", key: "applied_on", width: 20 },
  { header: "TL Comment", key: "tl_comment", width: 24 },
  { header: "Mgr Comment", key: "mgr_comment", width: 24 },
  { header: "TL Action Date", key: "tl_action_date", width: 20 },
  { header: "Mgr Action Date", key: "mgr_action_date", width: 20 },
  { header: "TL Name", key: "tl_name", width: 18 },
  { header: "Mgr Name", key: "mgr_name", width: 18 },
];

const OVERTIME_COLUMNS = [
  { header: "Request ID", key: "id", width: 12 },
  { header: "Employee ID", key: "emp_id", width: 12 },
  { header: "Employee", key: "emp_name", width: 22 },
  { header: "Section", key: "section", width: 14 },
  { header: "Work Date", key: "work_date", width: 12 },
  { header: "Hours", key: "hours", width: 8 },
  { header: "Reason", key: "reason", width: 30 },
  { header: "Status", key: "status", width: 12 },
  { header: "Applied On", key: "applied_on", width: 20 },
  { header: "TL Comment", key: "tl_comment", width: 24 },
  { header: "TL Action Date", key: "tl_action_date", width: 20 },
  { header: "TL Name", key: "tl_name", width: 18 },
  { header: "Comp Off Days", key: "comp_off_days", width: 14 },
];

function addSheet(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  rows.forEach(r => sheet.addRow(r));
  return sheet;
}

export async function buildWorkbook({ supabaseUrl, supabaseKey, month }) {
  const { start, end } = monthRange(month);

  const employees = await fetchAllRows(supabaseUrl, supabaseKey, "employees", "id");
  const leaveRequests = await fetchAllRows(supabaseUrl, supabaseKey, "leave_requests", "id");
  const overtimeRequests = await fetchAllRows(supabaseUrl, supabaseKey, "overtime_requests", "id");

  const leaveInMonth = leaveRequests.filter(r => anyDateInRange(r, ["applied_on", "start_date"], start, end));
  const overtimeInMonth = overtimeRequests.filter(r => anyDateInRange(r, ["applied_on", "work_date"], start, end));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ADB SAFEGATE AGL Portal — monthly-report.mjs";
  addSheet(workbook, "Roster (current)", ROSTER_COLUMNS, employees);
  addSheet(workbook, `Leave ${month}`, LEAVE_COLUMNS, leaveInMonth);
  addSheet(workbook, `Overtime ${month}`, OVERTIME_COLUMNS, overtimeInMonth);

  return { workbook, counts: { employees: employees.length, leave: leaveInMonth.length, overtime: overtimeInMonth.length } };
}

/**
 * Upload (or overwrite, if a file with the same name already exists in the
 * folder) the report to Google Drive via a service account. Scope is the
 * broad `drive` scope, not `drive.file` — a service account has no Drive
 * content of its own, so this only ever reaches folders a human has
 * explicitly shared with the service account's email; `drive.file` has had
 * inconsistent behavior finding files it didn't itself create, which this
 * script needs to do on a re-run for the same month.
 */
export async function uploadToDrive({ serviceAccountKeyJson, folderId, filename, buffer }) {
  const credentials = JSON.parse(serviceAccountKeyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const drive = google.drive({ version: "v3", auth });

  const escaped = filename.replace(/'/g, "\\'");
  const existing = await drive.files.list({
    q: `name = '${escaped}' and '${folderId}' in parents and trashed = false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  const media = {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body: Readable.from(buffer),
  };

  if (existing.data.files?.length) {
    const fileId = existing.data.files[0].id;
    await drive.files.update({ fileId, media });
    return { id: fileId, action: "updated" };
  }

  const created = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media,
    fields: "id",
  });
  return { id: created.data.id, action: "created" };
}

export async function runMonthlyReport({
  supabaseUrl, supabaseKey, serviceAccountKeyJson, folderId, month,
}) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.");
  }
  if (!serviceAccountKeyJson || !folderId) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY and GOOGLE_DRIVE_FOLDER_ID must both be set.");
  }

  const { workbook, counts } = await buildWorkbook({ supabaseUrl, supabaseKey, month });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `AGL-Portal-Report-${month}.xlsx`;

  const upload = await uploadToDrive({ serviceAccountKeyJson, folderId, filename, buffer });
  console.log(`[monthly-report] ${filename}: ${counts.employees} employees, `
    + `${counts.leave} leave requests, ${counts.overtime} overtime requests -> Drive file `
    + `${upload.id} (${upload.action})`);

  return { filename, counts, ...upload };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const args = parseArgs(process.argv.slice(2));
  const month = args.month || previousMonth(new Date());
  runMonthlyReport({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    serviceAccountKeyJson: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
    month,
  }).catch(e => {
    console.error("[monthly-report] FAILED:", e.message);
    process.exit(1);
  });
}
