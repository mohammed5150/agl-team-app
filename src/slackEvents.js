// Slack message text for every portal event that posts to Slack, kept in one
// place so the call sites in app.jsx and errorReporter.js stay about their
// own job — writing a leave request, filing an error report — not about
// wording a Slack message. Mirrors why leaveWorkflow.js and
// overtimeWorkflow.js exist: pure, testable, and the one place to change a
// message's wording or add an event without hunting through app.jsx.
//
// Actually sending is supabasePortal.js's sendSlack(); this module only
// decides what to say. None of these functions do any I/O.

// Both leave events (a new submission and each approve/reject) reuse the
// same message text app.jsx already built for the in-app notification/push —
// passed in here, not recomputed — so there's one source for the wording and
// only the emoji prefix is added for Slack.
export const leaveEvent = message => `📅 ${message}`;
export const overtimeEvent = message => `🕐 ${message}`;

export const employeeInvited = (name, email) =>
  `👋 New joiner invited: ${name} (${email})`;

export const bulkInvited = count =>
  `👋 Bulk import: ${count} new joiner${count === 1 ? "" : "s"} invited`;

export const profileFinalized = name => `✅ ${name} finalized their profile`;

// Deliberately no employee identity — the caller (errorReporter.js) already
// scrubs `message`, and the database, not Slack, is where a fault gets
// investigated. See docs/MONITORING.md §6.
export const errorAlert = (kind, route, message) =>
  `🚨 [${kind}] ${route ? `${route}: ` : ""}${message}`;
