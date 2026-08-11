// What a portal load actually MEANT.
//
// THE DEFECT THIS EXISTS FOR
// loadPortalData fires five selects and then applied a single test — "is there
// an employee row whose email matches the signed-in address?" A failed read
// returns no rows, and no rows is indistinguishable from "you have no employee
// record" if the only thing you look at is the rows.
//
// So any outage that made the employees select fail — an RLS change, an expired
// key, a dropped connection, Supabase having a bad minute — told every member of
// the team, by name and email, that they are "not registered as an employee.
// Please contact your admin", and then signed them out. The most alarming
// message the portal can produce, shown for the one cause it does not mean, to
// everybody at once. The admin then gets thirteen identical reports about an
// account problem that does not exist.
//
// The two cases need different answers because they need different actions:
//   load-failed    the session is fine — keep it, say it is us, offer Retry
//   not-registered the session is real but this person is not on the roster —
//                  that genuinely is one for the admin, and signing out is right
//
// Kept pure and separate from app.jsx so it can be tested without a database;
// app.jsx holds no branch of its own beyond acting on the verdict.

/** Shown when the roster could not be read. Deliberately blames the system. */
export const LOAD_FAILED_MESSAGE =
  "We couldn't load the team portal just now. This is a connection or server "
  + "problem — not a problem with your account or your password. "
  + "Please try again in a moment.";

/** Shown only when the roster WAS read and genuinely has no row for this user. */
export function notRegisteredMessage(email) {
  return "Your email (" + (email || "unknown") + ") is not registered as an "
    + "employee. Please contact your admin.";
}

/** Case-insensitive, whitespace-tolerant match on the login address. */
export function findEmployeeByEmail(employees, authEmail) {
  const target = String(authEmail || "").trim().toLowerCase();
  if (!target) return null;
  return (employees || []).find(
    e => String(e?.email || "").trim().toLowerCase() === target
  ) || null;
}

/**
 * Decide the outcome of a portal load.
 *
 * @param {object} r
 *   @param {object|null} r.employeesResult  the { data, error } of the employees select
 *   @param {string}      r.authEmail        the signed-in address
 *   @param {object}      [r.secondary]      { leave, overtime, announcements, notifications }
 *                                           of { data, error } — non-fatal tables
 * @returns {{status:"ok"|"load-failed"|"not-registered", me:object|null,
 *            message:string, degraded:string[]}}
 */
export function classifyPortalLoad({ employeesResult, authEmail, secondary } = {}) {
  const base = { me: null, message: "", degraded: degradedTables(secondary) };

  // A read that errored proves nothing about the roster's contents.
  if (!employeesResult || employeesResult.error) {
    return { ...base, status: "load-failed", message: LOAD_FAILED_MESSAGE };
  }
  // No error but no array either — PostgREST did not actually answer. Treat it
  // as the failure it is rather than as an empty roster, which would send us
  // down the "you are not registered" path on a technicality.
  if (!Array.isArray(employeesResult.data)) {
    return { ...base, status: "load-failed", message: LOAD_FAILED_MESSAGE };
  }
  // An empty roster is never a legitimate state for a signed-in user: this
  // portal cannot have zero employees while somebody is logged into it. It
  // means the select was filtered to nothing by RLS, which is a system fault,
  // not a statement about this person.
  if (employeesResult.data.length === 0) {
    return { ...base, status: "load-failed", message: LOAD_FAILED_MESSAGE };
  }

  const me = findEmployeeByEmail(employeesResult.data, authEmail);
  if (!me) {
    return { ...base, status: "not-registered", message: notRegisteredMessage(authEmail) };
  }
  return { ...base, status: "ok", me };
}

/**
 * Which non-critical tables failed to load.
 *
 * These do not stop the portal opening — a dashboard with no announcements is
 * far better than a locked-out team — but they must not be silent either, or
 * an empty Leave page reads as "I have no leave requests" when it really means
 * "we could not fetch them".
 */
export function degradedTables(secondary) {
  if (!secondary) return [];
  const LABELS = {
    leave: "leave requests",
    overtime: "overtime requests",
    announcements: "announcements",
    notifications: "notifications",
  };
  return Object.keys(LABELS)
    .filter(k => secondary[k] && secondary[k].error)
    .map(k => LABELS[k]);
}

/**
 * Combine the rows a user may read in FULL with the safe directory stubs for
 * everyone else.
 *
 * WHY THE ROSTER COMES FROM TWO PLACES NOW
 * `employees` carries passport and Emirates ID numbers, date of birth, home
 * address, mobile, emergency contacts and salary band. Its RLS policy used to
 * be `current_emp_id() IS NOT NULL` — any signed-in employee could read every
 * column of all 92 rows. The UI hid it (the Team page is staff-only) but the
 * REST API did not: a token and one request to /rest/v1/employees returned the
 * lot. With two accounts in existence that was theoretical; with the whole
 * team onboarding it is not.
 *
 * So `employees` is now self-or-staff, and `employee_directory` — a view of
 * id/name/role/section only, no personal data — covers what an ordinary
 * employee legitimately needs about colleagues. That turns out to be very
 * little: their nav has no Team, Performance or Calendar page, and the only
 * code that reads other people's rows is newRequestRecipients /
 * newOvertimeRecipients, which need `id` and `role` to route an approval
 * notification to the right team lead and manager.
 *
 * Full rows always win over stubs, so a manager (who can read everything) is
 * unaffected, and a user's own row is never a stub.
 */
export function mergeRoster(fullRows, directoryRows) {
  const byId = new Map();
  for (const d of directoryRows || []) {
    if (d && d.id != null) byId.set(d.id, d);
  }
  for (const f of fullRows || []) {
    if (f && f.id != null) byId.set(f.id, f);
  }
  return [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/** Human sentence for a partial load, or "" when everything arrived. */
export function degradedMessage(degraded) {
  if (!degraded || degraded.length === 0) return "";
  const list = degraded.length === 1
    ? degraded[0]
    : degraded.slice(0, -1).join(", ") + " and " + degraded[degraded.length - 1];
  return "Some data could not be loaded (" + list + "). What you see may be "
    + "incomplete — refresh to try again.";
}
