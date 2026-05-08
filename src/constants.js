export const SECTIONS = ["AGL 12hrs", "AGL 8hrs", "Helpdesk", "Systems", "High Masts"];
export const LEAVE_TYPES = ["Annual Leave", "Sick Leave", "Comp-Off", "Emergency Leave", "Unpaid Leave"];
export const STATUS_COLORS = { pending: "#f59e0b", tl_approved: "#38bdf8", approved: "#10b981", rejected: "#ef4444" };
export const STATUS_LABELS = { pending: "Pending TL", tl_approved: "Pending MGR", approved: "Approved", rejected: "Rejected" };
export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const SHIFT_HOURS = {
  "AGL 12hrs": { M:12, N:12 },
  "AGL 8hrs": { M:8 },
  "Helpdesk": { M:12, N:12 },
  "Systems": { M:12, N:12 },
  "High Masts": { M:8 }
};

export const DOC_TYPES = [
  { key:"passport", label:"Passport", icon:"📘" },
  { key:"visa", label:"UAE Visa", icon:"📝" },
  { key:"eid", label:"Emirates ID", icon:"🆔" },
  { key:"license", label:"Driving Licence", icon:"🚗" },
  { key:"medical", label:"Medical Fitness", icon:"🏥" },
  { key:"airport", label:"Airport Pass", icon:"🛫" },
  { key:"other", label:"Other", icon:"📄" }
];

export const ANN_PRIORITIES = [
  { key:"info", label:"Info", color:"#38bdf8" },
  { key:"important", label:"Important", color:"#f59e0b" },
  { key:"urgent", label:"Urgent", color:"#ef4444" }
];

export const theme = {
  bg:"#0b1a2b", card:"rgba(255,255,255,0.04)", cs:"#111f30",
  ch:"rgba(255,255,255,0.07)", bd:"rgba(255,255,255,0.08)", bl:"rgba(255,255,255,0.12)",
  pet:"#15425f", pl:"#1a5a80", or:"#e8702a", ol:"#f5923e", yl:"#f5a623",
  tx:"#f0f4f8", ts:"#94a3b8", td:"#64748b",
  gn:"#10b981", rd:"#ef4444", bu:"#38bdf8", pu:"#a78bfa", cy:"#22d3ee",
  gp:"linear-gradient(135deg,#15425f,#1a5a80)",
  ga:"linear-gradient(135deg,#e8702a,#f5923e)"
};
