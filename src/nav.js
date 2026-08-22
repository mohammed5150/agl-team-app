export const NE = [
  { key:"dashboard", label:"Dashboard", icon:"bar-chart" },
  { key:"profile", label:"My Profile", icon:"user" },
  { key:"leave", label:"Leave", icon:"calendar" },
  { key:"overtime", label:"Overtime", icon:"clock" },
  { key:"attendance", label:"My Attendance", icon:"check-square" },
  { key:"training", label:"Training", icon:"grad-cap" },
  { key:"documents", label:"My Documents", icon:"folder" },
  { key:"announcements", label:"Announcements", icon:"megaphone" },
  { key:"changepw", label:"Settings", icon:"gear" }
];

export const NM = [
  { key:"dashboard", label:"Dashboard", icon:"bar-chart" },
  { key:"team", label:"Employees", icon:"users" },
  { key:"performance", label:"Performance", icon:"award" },
  { key:"approvals", label:"Approvals", icon:"bell" },
  { key:"attendance", label:"Working Hours", icon:"stopwatch" },
  { key:"leave", label:"Leave Requests", icon:"calendar" },
  { key:"overtime", label:"Overtime", icon:"clock" },
  { key:"calendar", label:"Leave Calendar", icon:"calendar-days" },
  { key:"training", label:"Training", icon:"grad-cap" },
  { key:"documents", label:"Documents", icon:"folder" },
  { key:"announcements", label:"Announcements", icon:"megaphone" },
  { key:"audit", label:"Audit Trail", icon:"list" },
  { key:"changepw", label:"Settings", icon:"gear" }
];

// Single source of truth for which nav items a role sees. Managers don't see
// the raw Working Hours roster (a TL concern), and only managers see the audit
// trail — audit_log's only policy is audit_select_manager, so the page would
// read empty for anyone else. Used by both the sidebar and the hash-routing
// validator so deep-link keys and visible pages never drift.
//
// Declared after the two tables it reads. This was safe as it stood (the
// function only runs once the module has finished evaluating), but it is the
// same shape as the temporal-dead-zone crash that took the portal down from
// app.jsx, so it reads in dependency order like everything else.
export function navItemsForRole(role) {
  if (role === "manager") return NM.filter(n => n.key !== "attendance");
  if (role === "teamlead") return NM.filter(n => n.key !== "audit");
  return NE;
}
