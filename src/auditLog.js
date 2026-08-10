// Reading the audit trail — pure shaping logic, so what a manager sees is
// testable without a database.
//
// The rows come from public.audit_log (supabase_audit_log.sql), which stores
// only the columns that actually changed, as two jsonb objects. That is the
// right storage shape and the wrong display shape, so everything that turns
// "old_values/new_values/changed_cols" into a sentence lives here.

import { STATUS_LABELS, OT_STATUS_LABELS } from "./constants.js";

/** Columns whose value the trigger replaces with a marker. */
export const REDACTED = "[redacted]";

/** Human names for the columns a manager is most often asked about. */
export const COLUMN_LABELS = {
  role: "Role",
  tier: "Capability tier",
  band: "Performance band",
  airport: "Airport",
  supplier: "Supplier",
  status: "Status",
  annual_leave: "Annual leave entitlement",
  used_annual: "Annual leave used",
  sick_leave: "Sick leave entitlement",
  used_sick: "Sick leave used",
  comp_off: "Comp-off balance",
  rating: "Rating",
  warnings: "Warnings",
  achievements: "Achievements",
  actions: "Actions",
  training: "Training",
  documents: "Documents",
  roster: "Roster",
  profile_finalized: "Profile finalized",
  initial_password: "Initial-password flag",
  employment_status: "Employment status",
  offboarded_at: "Offboarded on",
  tl_comment: "Team lead comment",
  mgr_comment: "Manager comment",
  tl_name: "Team lead",
  mgr_name: "Manager",
  tl_action_date: "Team lead action date",
  mgr_action_date: "Manager action date",
  emp_id: "Employee",
  emp_name: "Employee name",
  start_date: "Start date",
  end_date: "End date",
  work_date: "Work date",
  days: "Days",
  hours: "Hours",
  type: "Leave type",
  reason: "Reason",
  section: "Section",
  designation: "Designation",
  emp_no: "Employee number",
  shift: "Shift",
  name: "Name",
  email: "Email",
  title: "Title",
  message: "Message",
  priority: "Priority",
  pinned: "Pinned",
  target: "Target",
};

export function columnLabel(col) {
  if (COLUMN_LABELS[col]) return COLUMN_LABELS[col];
  // Fall back to the column name made readable, so a column added later
  // still renders sensibly instead of showing raw snake_case.
  return col.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
}

export const TABLE_LABELS = {
  employees: "Employee",
  leave_requests: "Leave request",
  overtime_requests: "Overtime request",
  announcements: "Announcement",
};

export function tableLabel(t) {
  return TABLE_LABELS[t] || t;
}

/** Render one jsonb value for display. */
export function formatValue(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (v === REDACTED) return "•••";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length === 1 ? "1 item" : `${v.length} items`;
  if (typeof v === "object") {
    const keys = Object.keys(v);
    return keys.length === 1 ? "1 field" : `${keys.length} fields`;
  }
  return String(v);
}

/** Status codes read better as the labels the rest of the UI uses. */
function formatStatus(table, value) {
  if (value === null || value === undefined) return "—";
  const map = table === "overtime_requests" ? OT_STATUS_LABELS : STATUS_LABELS;
  return map[value] || String(value);
}

/**
 * The changed fields of one entry, as { column, label, from, to } rows.
 * Sorted so the columns a manager cares about lead: status first, then the
 * privileged fields, then everything else alphabetically.
 */
const LEAD_COLUMNS = [
  "status", "role", "tier", "band", "employment_status",
  "annual_leave", "used_annual", "sick_leave", "used_sick", "comp_off",
];

export function describeChanges(entry) {
  if (!entry) return [];
  const cols = entry.changed_cols || [];
  const oldV = entry.old_values || {};
  const newV = entry.new_values || {};

  const rows = cols.map(c => ({
    column: c,
    label: columnLabel(c),
    from: c === "status" ? formatStatus(entry.table_name, oldV[c]) : formatValue(oldV[c]),
    to:   c === "status" ? formatStatus(entry.table_name, newV[c]) : formatValue(newV[c]),
    redacted: oldV[c] === REDACTED || newV[c] === REDACTED,
  }));

  return rows.sort((a, b) => {
    const ai = LEAD_COLUMNS.indexOf(a.column);
    const bi = LEAD_COLUMNS.indexOf(b.column);
    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return a.label.localeCompare(b.label);
  });
}

/**
 * One-line summary of an entry, for the collapsed row in the list.
 *
 * A status change is the headline whenever there is one, because that is the
 * approval the log exists to record. Otherwise it names the fields.
 */
export function summarize(entry, employeeName) {
  if (!entry) return "";
  const who = employeeName || entry.record_id || "record";
  const noun = tableLabel(entry.table_name).toLowerCase();

  if (entry.action === "insert") return `Created ${noun} ${entry.record_id}`;
  if (entry.action === "delete") return `Deleted ${noun} ${entry.record_id}`;

  const cols = entry.changed_cols || [];
  if (cols.includes("status")) {
    const to = formatStatus(entry.table_name, (entry.new_values || {}).status);
    return `${entry.record_id} → ${to}`;
  }
  if (!cols.length) return `Updated ${noun} ${entry.record_id}`;
  if (cols.length === 1) return `${who}: ${columnLabel(cols[0])} changed`;
  if (cols.length === 2) return `${who}: ${columnLabel(cols[0])} and ${columnLabel(cols[1])} changed`;
  return `${who}: ${cols.length} fields changed`;
}

/** Who did it, preferring the roster name over the raw email. */
export function actorName(entry, employees = []) {
  if (!entry) return "Unknown";
  if (entry.actor_context === "service_role") return "System (backend)";
  if (entry.actor_context === "sql_editor")   return "Administrator (SQL editor)";
  const emp = employees.find(e => e.id === entry.actor_emp_id);
  if (emp?.name) return emp.name;
  return entry.actor_email || entry.actor_emp_id || "Unknown";
}

export const AUDIT_FILTERS = [
  { key: "all",         label: "All activity" },
  { key: "approvals",   label: "Approvals" },
  { key: "privileged",  label: "Role & pay" },
  { key: "balances",    label: "Leave balances" },
  { key: "announcements", label: "Announcements" },
];

const PRIVILEGED_COLS = ["role", "tier", "band", "airport", "supplier", "employment_status"];
const BALANCE_COLS = ["annual_leave", "used_annual", "sick_leave", "used_sick", "comp_off"];

/** Apply the named filter plus a free-text query. */
export function filterEntries(entries, { filter = "all", query = "", employees = [] } = {}) {
  const q = query.trim().toLowerCase();

  return (entries || []).filter(e => {
    const cols = e.changed_cols || [];

    if (filter === "approvals") {
      if (!["leave_requests", "overtime_requests"].includes(e.table_name)) return false;
      if (!cols.includes("status")) return false;
    } else if (filter === "privileged") {
      if (e.table_name !== "employees") return false;
      if (!cols.some(c => PRIVILEGED_COLS.includes(c))) return false;
    } else if (filter === "balances") {
      if (e.table_name !== "employees") return false;
      if (!cols.some(c => BALANCE_COLS.includes(c))) return false;
    } else if (filter === "announcements") {
      if (e.table_name !== "announcements") return false;
    }

    if (!q) return true;
    const haystack = [
      e.record_id, e.actor_email, e.actor_emp_id, e.reason,
      actorName(e, employees), tableLabel(e.table_name),
      ...cols.map(columnLabel),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

/** Map a raw audit_log row from Supabase into the shape the UI uses. */
export function auditFromDb(r) {
  return {
    id: r.id,
    occurredAt: r.occurred_at,
    txid: r.txid,
    table_name: r.table_name,
    record_id: r.record_id,
    action: r.action,
    changed_cols: r.changed_cols || [],
    old_values: r.old_values || {},
    new_values: r.new_values || {},
    actor_emp_id: r.actor_emp_id,
    actor_email: r.actor_email,
    actor_role: r.actor_role,
    actor_context: r.actor_context,
    reason: r.reason || "",
  };
}

/**
 * Export rows as CSV, for the "show me who approved what" request that
 * arrives as a spreadsheet. Values are quoted and internal quotes doubled,
 * and a leading =/+/-/@ is prefixed with an apostrophe so a spreadsheet does
 * not evaluate a logged value as a formula.
 */
export function toCsv(entries, employees = []) {
  const header = [
    "Timestamp", "Table", "Record", "Action", "Changed fields",
    "From", "To", "Actor", "Actor email", "Actor role", "Reason",
  ];
  const cell = v => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [header.map(cell).join(",")];

  for (const e of entries || []) {
    const changes = describeChanges(e);
    lines.push([
      e.occurredAt,
      tableLabel(e.table_name),
      e.record_id,
      e.action,
      changes.map(c => c.label).join("; "),
      changes.map(c => c.from).join("; "),
      changes.map(c => c.to).join("; "),
      actorName(e, employees),
      e.actor_email,
      e.actor_role,
      e.reason,
    ].map(cell).join(","));
  }
  return lines.join("\n");
}
