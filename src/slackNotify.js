// Pure formatter feeding the send-slack Edge Function.
//
// These helpers turn portal events (leave/overtime requests) into the
// { text, title, level } objects the send-slack function accepts. They are
// pure and side-effect-free — no supa import, no I/O — so they are trivially
// unit-testable like leaveWorkflow.js. Missing fields degrade gracefully
// rather than throwing.
//
//   level ∈ "info" | "success" | "warn" | "urgent"

// Show a value if present, otherwise a neutral placeholder, so a partial
// record never renders "undefined" into the channel.
const val = (v, fallback = "?") =>
  (v === undefined || v === null || v === "") ? fallback : v;

/**
 * Format a leave-request event.
 * @param kind "submitted" | "approved" | "rejected"
 * @param r    { empName, type, startDate, endDate, days, status, tlName, mgrName }
 */
export function formatLeaveEvent(kind, r = {}) {
  const name  = val(r.empName, "Someone");
  const type  = val(r.type, "leave");
  const days  = val(r.days, "?");
  const range = `${val(r.startDate)}→${val(r.endDate)}`;

  if (kind === "approved") {
    return {
      level: "success",
      title: "Leave approved",
      text: `*${name}*'s ${type} approved (${days}d, ${range})`,
    };
  }
  if (kind === "rejected") {
    return {
      level: "warn",
      title: "Leave rejected",
      text: `*${name}*'s ${type} rejected (${days}d, ${range})`,
    };
  }
  // submitted (default)
  return {
    level: "info",
    title: "New leave request",
    text: `*${name}* requested ${type} (${days}d, ${range})`,
  };
}

/**
 * Format an overtime-request event.
 * @param kind "submitted" | "approved" | "rejected"
 * @param r    { empName, hours, workDate, status }
 */
export function formatOvertimeEvent(kind, r = {}) {
  const name  = val(r.empName, "Someone");
  const hours = val(r.hours, "?");
  const date  = val(r.workDate);

  if (kind === "approved") {
    return {
      level: "success",
      title: "Overtime approved",
      text: `*${name}*'s ${hours}h overtime on ${date} approved`,
    };
  }
  if (kind === "rejected") {
    return {
      level: "warn",
      title: "Overtime rejected",
      text: `*${name}*'s ${hours}h overtime on ${date} rejected`,
    };
  }
  // submitted (default)
  return {
    level: "info",
    title: "New overtime request",
    text: `*${name}* logged ${hours}h overtime on ${date}`,
  };
}
