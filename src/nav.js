export const NE = [
  { key:"dashboard", label:"Dashboard", icon:"📊" },
  { key:"profile", label:"My Profile", icon:"👤" },
  { key:"leave", label:"Leave", icon:"📅" },
  { key:"attendance", label:"My Attendance", icon:"✅" },
  { key:"training", label:"Training", icon:"🎓" },
  { key:"documents", label:"My Documents", icon:"📁" },
  { key:"announcements", label:"Announcements", icon:"📢" },
  { key:"changepw", label:"Settings", icon:"⚙️" }
];

// Single source of truth for which nav items a role sees. Managers don't see
// the raw Working Hours roster (a TL concern). Used by both the sidebar and the
// hash-routing validator so deep-link keys and visible pages never drift.
export function navItemsForRole(role) {
  if (role === "manager") return NM.filter(n => n.key !== "attendance");
  if (role === "teamlead") return NM;
  return NE;
}

export const NM = [
  { key:"dashboard", label:"Dashboard", icon:"📊" },
  { key:"team", label:"Employees", icon:"👥" },
  { key:"performance", label:"Performance", icon:"🏆" },
  { key:"approvals", label:"Approvals", icon:"🔔" },
  { key:"attendance", label:"Working Hours", icon:"⏱️" },
  { key:"leave", label:"Leave Requests", icon:"📅" },
  { key:"calendar", label:"Leave Calendar", icon:"🗓️" },
  { key:"training", label:"Training", icon:"🎓" },
  { key:"documents", label:"Documents", icon:"📁" },
  { key:"announcements", label:"Announcements", icon:"📢" },
  { key:"changepw", label:"Settings", icon:"⚙️" }
];
