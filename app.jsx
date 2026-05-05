
const { useState, useCallback, useMemo, useEffect, useRef } = React;

/* ============================================================
   CONSTANTS & THEME
   ============================================================ */

const SECTIONS = ["AGL 12hrs", "AGL 8hrs", "Helpdesk", "Systems", "High Masts"];
const LEAVE_TYPES = ["Annual Leave", "Sick Leave", "Comp-Off", "Emergency Leave", "Unpaid Leave"];
const STATUS_COLORS = { pending: "#f59e0b", tl_approved: "#38bdf8", approved: "#10b981", rejected: "#ef4444" };
const STATUS_LABELS = { pending: "Pending TL", tl_approved: "Pending MGR", approved: "Approved", rejected: "Rejected" };
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const SHIFT_HOURS = {
  "AGL 12hrs": { M:12, N:12 },
  "AGL 8hrs": { M:8 },
  "Helpdesk": { M:12, N:12 },
  "Systems": { M:12, N:12 },
  "High Masts": { M:8 }
};

const DOC_TYPES = [
  { key:"passport", label:"Passport", icon:"📘" },
  { key:"visa", label:"UAE Visa", icon:"📝" },
  { key:"eid", label:"Emirates ID", icon:"🆔" },
  { key:"license", label:"Driving Licence", icon:"🚗" },
  { key:"medical", label:"Medical Fitness", icon:"🏥" },
  { key:"airport", label:"Airport Pass", icon:"🛫" },
  { key:"other", label:"Other", icon:"📄" }
];

const ANN_PRIORITIES = [
  { key:"info", label:"Info", color:"#38bdf8" },
  { key:"important", label:"Important", color:"#f59e0b" },
  { key:"urgent", label:"Urgent", color:"#ef4444" }
];

const theme = {
  bg:"#0b1a2b", card:"rgba(255,255,255,0.04)", cs:"#111f30",
  ch:"rgba(255,255,255,0.07)", bd:"rgba(255,255,255,0.08)", bl:"rgba(255,255,255,0.12)",
  pet:"#15425f", pl:"#1a5a80", or:"#e8702a", ol:"#f5923e", yl:"#f5a623",
  tx:"#f0f4f8", ts:"#94a3b8", td:"#64748b",
  gn:"#10b981", rd:"#ef4444", bu:"#38bdf8", pu:"#a78bfa", cy:"#22d3ee",
  gp:"linear-gradient(135deg,#15425f,#1a5a80)",
  ga:"linear-gradient(135deg,#e8702a,#f5923e)"
};

/* ============================================================
   ROSTER PATTERN HELPERS
   ============================================================ */

const P12 = [
  ["O","O","M","M","O","O","N","N"],
  ["M","M","O","O","M","M","O","O"],
  ["N","N","O","O","N","N","O","O"],
  ["O","O","N","N","O","O","M","M"]
];
const P8  = [["M","M","M","M","M","M","O"], ["M","M","M","M","M","O","M"]];
const PHD = [
  ["N","N","O","O","N","N","O","O"],
  ["O","O","N","N","O","O","M","M"],
  ["M","O","M","M","O","O","N","N"]
];
const PSY = [
  ["M","M","M","O","O","M","M","N","N","O","O","M","M","N","N"],
  ["N","O","O","M","M","N","N","O","O","M","M","N","N","O","O"]
];

const gR = (s, p, y, m) => {
  const d = new Date(y, m+1, 0).getDate();
  return Array.from({length:d}, (_,i) => ({
    day: i+1,
    code: p[i % p.length],
    date: `${y}-${String(m+1).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`
  }));
};

/* ============================================================
   EMPLOYEE FACTORY + SEED DATA
   ============================================================ */

const mE = (id, nm, sec, des, pi, em) => {
  const ps = sec==="AGL 12hrs"?P12:sec==="AGL 8hrs"?P8:sec==="Helpdesk"?PHD:sec==="Systems"?PSY:P8;
  const pa = ps[pi % ps.length];
  const rr = {};
  [0,1,2,3].forEach(m => {
    const r = gR(sec, pa, 2026, m);
    if (Math.random() > 0.5) {
      let a = 0;
      for (let i=5; i<r.length && a<2; i+=7) {
        if (r[i].code !== "O") { r[i] = {...r[i], code:"L"}; a++; }
      }
    }
    rr[`2026-${String(m+1).padStart(2,"0")}`] = r;
  });
  const idNum = id.split("-")[1];
  return {
    id,
    email: em || (() => {
      const parts = nm.toLowerCase().split(" ");
      return (parts[0] + "." + parts[parts.length - 1]).replace(/[^a-z.]/g, "") + "@adbsafegate.ae";
    })(),
    name: nm, section: sec, designation: des,
    shift: sec==="AGL 12hrs" ? "12hr" : (sec==="AGL 8hrs"||sec==="High Masts") ? "8hr" : "24hr",
    nationality: "Indian",
    mobile: "+971 50 " + String(Math.floor(Math.random()*9e6+1e6)),
    empNo: "ADB-" + idNum,
    dob: "1990-01-15", maritalStatus: "Single", address: "Abu Dhabi, UAE",
    joinDate: "2019-01-01",
    emergencyContact: "+971 50 000 0000", emergencyName: "N/A",
    passportNo: "AB" + (1000000 + parseInt(idNum)*37).toString().slice(0,7),
    passportExpiry: "2028-12-31",
    visaExpiry: "2027-06-30",
    eidNo: "784-" + (1985 + (parseInt(idNum) % 15)) + "-" + (1000000 + parseInt(idNum)*123).toString().slice(0,7) + "-" + (parseInt(idNum) % 10),
    eidExpiry: "2027-06-30",
    annualLeave: 30, usedAnnual: Math.floor(Math.random()*10),
    sickLeave: 15, usedSick: Math.floor(Math.random()*5),
    compOff: Math.floor(Math.random()*4),
    role: "employee",
    roster: rr,
    achievements: [], warnings: [], actions: [],
    training: [
      { id:1, title:"AGL Basic Maintenance", provider:"ADB Safegate Academy", completedDate:"2024-06-15", certExpiry:"2026-06-15", certNo:"AGL-B-"+idNum },
      { id:2, title:"Airfield Safety Awareness", provider:"GCAA", completedDate:"2025-01-20", certExpiry:"2027-01-20", certNo:"ASA-"+idNum },
      { id:3, title:"First Aid & CPR", provider:"Red Crescent UAE", completedDate:"2024-03-10", certExpiry:"2026-03-10", certNo:"FA-"+idNum },
      { id:4, title:"Working at Heights", provider:"ADNOC HSE", completedDate:"2025-08-05", certExpiry:"2026-08-05", certNo:"WAH-"+idNum },
      { id:5, title:"Fire Safety & Emergency", provider:"Abu Dhabi Civil Defense", completedDate:"2025-04-12", certExpiry:"2027-04-12", certNo:"FSER-"+idNum }
    ],
    documents: [
      { id:1, type:"passport", title:"Passport", docNo:"AB"+(1000000+parseInt(idNum)*37).toString().slice(0,7), issueDate:"2019-01-05", expiryDate:"2028-12-31", fileName:"passport_scan.pdf" },
      { id:2, type:"visa", title:"Employment Visa", docNo:"UAE/"+idNum+"/2024", issueDate:"2024-06-30", expiryDate:"2027-06-30", fileName:"visa_stamp.pdf" },
      { id:3, type:"eid", title:"Emirates ID", docNo:"784-"+(1985+(parseInt(idNum)%15))+"-"+(1000000+parseInt(idNum)*123).toString().slice(0,7)+"-"+(parseInt(idNum)%10), issueDate:"2024-07-15", expiryDate:"2027-06-30", fileName:"eid_front_back.jpg" },
      { id:4, type:"airport", title:"ZIA Airport Pass", docNo:"ZIA-"+idNum, issueDate:"2025-01-01", expiryDate:(parseInt(idNum)%7===0 ? "2026-05-15" : "2027-01-01"), fileName:"airport_pass.jpg" }
    ]
  };
};

const INITIAL_EMPLOYEES = [
  mE("EMP-001","Amarnath Munderi","AGL 12hrs","AGL Technician",0),
  mE("EMP-002","Subash Chouhan","AGL 12hrs","AGL Technician",0),
  mE("EMP-003","Thauseef Khan","AGL 12hrs","AGL Technician",0),
  mE("EMP-004","Abubaker Irshad","AGL 12hrs","AGL Technician",1),
  mE("EMP-005","Gopakumar Gopinathan","AGL 12hrs","Sr. AGL Technician",3),
  mE("EMP-006","Babloo Sharma","AGL 12hrs","AGL Technician",3),
  mE("EMP-007","Upendra","AGL 12hrs","AGL Technician",3),
  mE("EMP-008","Gineesh Navaratna","AGL 12hrs","AGL Technician",3),
  mE("EMP-009","Anurag Aikkal","AGL 12hrs","AGL Technician",2),
  mE("EMP-010","Abhijith","AGL 12hrs","AGL Technician",2),
  mE("EMP-011","Shaji Kolavayal","AGL 12hrs","AGL Technician",2),
  mE("EMP-012","Dhaneesh Punnakkal","AGL 12hrs","AGL Technician",1),
  mE("EMP-013","Badarul Muneer","AGL 12hrs","AGL Technician",1),
  mE("EMP-014","Vikram Pal","AGL 12hrs","AGL Technician",1),
  mE("EMP-015","Latheef Ummer","AGL 12hrs","AGL Technician",1),
  mE("EMP-016","Thomas Padipurakkal","AGL 12hrs","AGL Technician",1),
  mE("EMP-017","Faheem Muhammed","AGL 8hrs","AGL Technician",0),
  mE("EMP-018","Sanoop Louis","AGL 8hrs","AGL Technician",0),
  mE("EMP-019","Nisar Ahmed","AGL 8hrs","AGL Technician",1),
  mE("EMP-020","Jiji Varghese","AGL 8hrs","AGL Technician",0),
  mE("EMP-021","Inchody Dinesh Ram","AGL 8hrs","AGL Technician",0),
  mE("EMP-022","Monish Menothparambil","AGL 8hrs","AGL Technician",0),
  mE("EMP-023","Nikhil Koyoon","AGL 8hrs","AGL Technician",0),
  mE("EMP-024","Sura Uthaman","AGL 8hrs","AGL Technician",1),
  mE("EMP-025","Ganesan Subramanian","AGL 8hrs","Sr. AGL Technician",1),
  mE("EMP-026","Gajendran Nagasundaram","AGL 8hrs","AGL Technician",0),
  mE("EMP-027","Tahseen Khan","AGL 8hrs","AGL Technician",0),
  mE("EMP-028","Abhishekh Pujari","AGL 8hrs","AGL Technician",0),
  mE("EMP-029","Muthukumar Cinniah","AGL 8hrs","AGL Technician",0),
  mE("EMP-030","Shigin Menothparambil","AGL 8hrs","AGL Technician",0),
  mE("EMP-031","Musthafa Erchat","AGL 8hrs","AGL Technician",0),
  mE("EMP-032","Vineeth Patteri","AGL 8hrs","AGL Technician",0),
  mE("EMP-033","Shanmugadas Raju","AGL 8hrs","AGL Technician",0),
  mE("EMP-034","Manish Yadav","AGL 8hrs","AGL Technician",0),
  mE("EMP-035","Midhun Babu","AGL 8hrs","AGL Technician",0),
  mE("EMP-036","Sandeep Selvan","AGL 8hrs","AGL Technician",1),
  mE("EMP-037","Danish Khan","AGL 8hrs","AGL Technician",0),
  mE("EMP-038","Rajesh Kanna Nagarajan","AGL 8hrs","AGL Technician",0),
  mE("EMP-039","Mahthab Imdadullah","AGL 8hrs","AGL Technician",0),
  mE("EMP-040","Raju Kolavayal","AGL 8hrs","AGL Technician",0),
  mE("EMP-041","Prasath Maharajan","AGL 8hrs","AGL Technician",1),
  mE("EMP-042","Adhul KP","AGL 8hrs","AGL Technician",0),
  mE("EMP-043","Musthafa Neduvally","AGL 8hrs","AGL Technician",0),
  mE("EMP-044","Mani Sanker","Helpdesk","Helpdesk Operator",0),
  mE("EMP-045","Rishan Muhammed","Helpdesk","Helpdesk Operator",2),
  mE("EMP-046","Yadhunath Kaitheri","Helpdesk","Helpdesk Operator",1),
  mE("EMP-047","Sreevatsa Pushpalatha","Helpdesk","Helpdesk Operator",1),
  mE("EMP-048","Farhan Muhammed","Helpdesk","Helpdesk Operator",1),
  mE("EMP-049","Prajesh Kadavankandi","Systems","Systems Technician",0),
  mE("EMP-050","Nithin Kumar","Systems","Systems Technician",1),
  mE("EMP-051","Haris Muhammed","Systems","Systems Technician",0),
  mE("EMP-052","Praveen Arunachalam","Systems","Systems Technician",1),
  mE("EMP-053","Balamurugan Maharaja","Systems","Systems Technician",0),
  mE("EMP-054","Syed Mussafir Shah","High Masts","High Mast Technician",0),
  mE("EMP-055","Abhishek Aramban","High Masts","High Mast Technician",0),
  mE("EMP-056","Divakar Gunasekaran","High Masts","High Mast Technician",1),
  mE("EMP-057","Jijo Sebastian","High Masts","High Mast Technician",0),
  mE("EMP-058","Mustafah Arshad","High Masts","High Mast Technician",0)
];

// Seed some performance records so demo has content
INITIAL_EMPLOYEES[0].achievements = [
  { id:1, title:"Best Performer - Q1 2026", date:"2026-03-31", by:"Ragesh Menon", desc:"Outstanding performance in AGL maintenance" },
  { id:2, title:"Safety Champion Award", date:"2026-02-15", by:"Mohammed Faheem", desc:"Zero incidents for 12 consecutive months" }
];
INITIAL_EMPLOYEES[0].actions = [
  { id:1, type:"commendation", title:"Letter of Appreciation", date:"2026-01-20", by:"Mohammed Faheem", desc:"Exceptional work during runway maintenance" }
];
INITIAL_EMPLOYEES[2].warnings = [
  { id:1, title:"Late Attendance Warning", date:"2026-03-10", by:"Mohammed Faheem", desc:"3 instances of late reporting in March", severity:"minor" }
];
INITIAL_EMPLOYEES[6].achievements = [
  { id:1, title:"Technical Excellence Award", date:"2026-02-28", by:"Ragesh Menon", desc:"Successfully led high mast retrofit project" }
];
INITIAL_EMPLOYEES[6].actions = [
  { id:1, type:"warning", title:"Verbal Warning - PPE", date:"2026-03-15", by:"Mohammed Faheem", desc:"Not wearing safety harness at height" }
];

const TEAMLEAD_USER = {
  id:"TL-001", email:"mohammed.faheem@adbsafegate.com",
  name:"Mohammed Faheem", role:"teamlead", designation:"Team Leader", section:"All", shift:"General",
  nationality:"Indian", mobile:"+971 50 222 0001", empNo:"ADB-2001",
  dob:"1985-03-20", maritalStatus:"Married", address:"Abu Dhabi, UAE", joinDate:"2015-06-01",
  emergencyContact:"+971 50 222 0002", emergencyName:"N/A",
  passportNo:"", passportExpiry:"", visaExpiry:"",
  eidNo:"784-XXXX-XXXXXXX-X", eidExpiry:"2028-12-31",
  annualLeave:30, usedAnnual:5, sickLeave:15, usedSick:1, compOff:2,
  documents:[], training:[]
};

const MANAGER_USER = {
  id:"MGR-001", email:"ragesh.menon@adbsafegate.ae",
  name:"Ragesh Menon", role:"manager", designation:"Maintenance Manager", section:"All", shift:"General",
  nationality:"Indian", mobile:"+971 50 333 0001", empNo:"ADB-3001",
  dob:"1980-07-10", maritalStatus:"Married", address:"Abu Dhabi, UAE", joinDate:"2012-01-15",
  emergencyContact:"+971 50 333 0002", emergencyName:"N/A",
  passportNo:"", passportExpiry:"", visaExpiry:"",
  eidNo:"784-XXXX-XXXXXXX-X", eidExpiry:"2028-12-31",
  annualLeave:30, usedAnnual:3, sickLeave:15, usedSick:0, compOff:0,
  documents:[], training:[]
};

const INITIAL_LEAVE_REQUESTS = [
  { id:"LR-001", empId:"EMP-001", empName:"Amarnath Munderi", section:"AGL 12hrs", type:"Annual Leave",
    startDate:"2026-04-15", endDate:"2026-04-18", days:4, reason:"Family visit to India",
    status:"pending", appliedOn:"2026-04-03T10:30:00", tlComment:"", mgrComment:"",
    tlActionDate:"", mgrActionDate:"", tlName:"", mgrName:"" },
  { id:"LR-002", empId:"EMP-017", empName:"Faheem Muhammed", section:"AGL 8hrs", type:"Sick Leave",
    startDate:"2026-04-22", endDate:"2026-04-23", days:2, reason:"Medical appointment",
    status:"tl_approved", appliedOn:"2026-04-15T08:15:00",
    tlComment:"Approved.", tlActionDate:"2026-04-15T14:00:00", tlName:"Mohammed Faheem",
    mgrComment:"", mgrActionDate:"", mgrName:"" },
  { id:"LR-003", empId:"EMP-049", empName:"Prajesh Kadavankandi", section:"Systems", type:"Annual Leave",
    startDate:"2026-04-20", endDate:"2026-04-25", days:6, reason:"Wedding ceremony",
    status:"approved", appliedOn:"2026-04-10T09:00:00",
    tlComment:"Approved", tlActionDate:"2026-04-10T16:00:00", tlName:"Mohammed Faheem",
    mgrComment:"Congratulations!", mgrActionDate:"2026-04-11T09:30:00", mgrName:"Ragesh Menon" },
  { id:"LR-004", empId:"EMP-005", empName:"Gopakumar Gopinathan", section:"AGL 12hrs", type:"Annual Leave",
    startDate:"2026-04-28", endDate:"2026-05-05", days:8, reason:"Family function",
    status:"approved", appliedOn:"2026-04-05T11:00:00",
    tlComment:"Approved", tlActionDate:"2026-04-05T17:00:00", tlName:"Mohammed Faheem",
    mgrComment:"Approved. Safe travels.", mgrActionDate:"2026-04-06T10:00:00", mgrName:"Ragesh Menon" }
];

const INITIAL_ANNOUNCEMENTS = [
  { id:"ANN-001", title:"LVO Operations - April 22-24, 2026",
    message:"Low Visibility Operations are expected between 22-24 April due to forecasted fog. All AGL and Systems teams must be on standby. Refer to MOC-OMAA-431 for procedures. Team leaders to brief shifts before handover.",
    priority:"urgent", pinned:true, date:"2026-04-18T08:00:00", by:"Ragesh Menon", target:"all" },
  { id:"ANN-002", title:"Ramadan Working Hours - Revised",
    message:"Revised working hours during Ramadan remain in effect until end of month. 8-hour shift: 07:30-14:30. 12-hour shifts unchanged. Please plan meals accordingly and hydrate before shift start.",
    priority:"important", pinned:true, date:"2026-04-12T09:00:00", by:"Ragesh Menon", target:"all" },
  { id:"ANN-003", title:"PPE Compliance - Weekly Audit",
    message:"Weekly PPE audit scheduled for Thursday 24 April. All technicians working on airside must carry full PPE including safety harness for height works. Non-compliance will be documented.",
    priority:"important", pinned:false, date:"2026-04-14T10:30:00", by:"Mohammed Faheem", target:"all" },
  { id:"ANN-004", title:"New Spares Stock Arrived",
    message:"EPCOS film capacitors and Littelfuse MOV varistors have arrived in the central stores. Contact Sanoop for allocation. Please update the spares register after collection.",
    priority:"info", pinned:false, date:"2026-04-10T14:00:00", by:"Mohammed Faheem", target:"AGL 8hrs" },
  { id:"ANN-005", title:"Training Schedule - May 2026",
    message:"Refresher training for Working at Heights will be conducted in the first week of May. Those with certificates expiring before June must attend. Dates to be confirmed.",
    priority:"info", pinned:false, date:"2026-04-08T11:00:00", by:"Ragesh Menon", target:"all" }
];

const nfId = () => `NF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const INITIAL_NOTIFICATIONS = [
  { id:"NF-SEED-001", to:"TL-001", type:"new_request", message:"New leave: Amarnath Munderi - Annual Leave (4d)", read:false, date:"2026-04-18T10:30:00" },
  { id:"NF-SEED-002", to:"MGR-001", type:"new_request", message:"Faheem Muhammed's leave approved by TL", read:false, date:"2026-04-15T14:00:00" },
  { id:"NF-SEED-003", to:"EMP-049", type:"approved", message:"Annual Leave APPROVED ✅", read:true, date:"2026-04-11T09:30:00" }
];

/* ============================================================
   NAVIGATION
   ============================================================ */

const NE = [
  { key:"dashboard", label:"Dashboard", icon:"📊" },
  { key:"profile", label:"My Profile", icon:"👤" },
  { key:"leave", label:"Leave", icon:"📅" },
  { key:"attendance", label:"My Attendance", icon:"✅" },
  { key:"training", label:"Training", icon:"🎓" },
  { key:"documents", label:"My Documents", icon:"📁" },
  { key:"announcements", label:"Announcements", icon:"📢" },
  { key:"changepw", label:"Settings", icon:"⚙️" }
];

const NM = [
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

// Rating helpers
const RATING_KEYS = [
  { k:"knowledge",  label:"Knowledge",  icon:"📘" },
  { k:"experience", label:"Experience", icon:"🏅" },
  { k:"loyalty",    label:"Loyalty",    icon:"🤝" },
  { k:"capability", label:"Capability", icon:"🛠️" },
];
const gradeFromRating = r => {
  if (!r) return null;
  const vals = RATING_KEYS.map(x => Number(r[x.k]) || 0).filter(v => v > 0);
  if (vals.length < 4) return null;
  const avg = vals.reduce((a,b) => a+b, 0) / 4;
  if (avg >= 4.5) return { label:"A+", color:"#10b981" };
  if (avg >= 4.0) return { label:"A",  color:"#22c55e" };
  if (avg >= 3.5) return { label:"B+", color:"#eab308" };
  if (avg >= 3.0) return { label:"B",  color:"#f59e0b" };
  return { label:"C", color:"#ef4444" };
};
const TIERS = ["A", "B", "C"];
const TIER_COLORS = { A:"#10b981", B:"#f59e0b", C:"#94a3b8" };

// Capability tier — top-level employees.tier column. Visible to TL + Manager,
// editable by Manager only (server-side enforced by trigger in supabase_tier.sql).
const TIERS_CAP = ["T1", "T2", "T3", "T4"];
const TIER_CAP_COLORS = { T1:"#10b981", T2:"#38bdf8", T3:"#f59e0b", T4:"#94a3b8" };

// Tiny CSV/TSV parser — handles quoted fields with embedded commas, tab or
// comma separators (auto-detected), and an optional header row. Returns
// { columns, rows } where columns is the inferred field order.
function parseCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { columns: [], rows: [] };
  const sep = text.includes("\t") ? "\t" : ",";
  const split = line => {
    const out = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i+1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (c === sep && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const parsed = lines.map(split);
  const HEADER_FIELDS = ["email","name","section","designation","role","tier"];
  const firstLower = parsed[0].map(s => s.toLowerCase());
  const looksLikeHeader = firstLower.some(s => HEADER_FIELDS.includes(s));
  if (looksLikeHeader) {
    return { columns: firstLower, rows: parsed.slice(1) };
  }
  return { columns: HEADER_FIELDS, rows: parsed };
}

function nextEmpId(employees, role) {
  const prefix = role === "manager" ? "MGR" : role === "teamlead" ? "TL" : "EMP";
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = employees.reduce((m, e) => {
    const n = re.exec(e.id || "");
    return n ? Math.max(m, parseInt(n[1], 10)) : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

// Training catalog extracted from AUH AFM Training Need Analysis Matrix 2026
const ROLE_CODES = {
  MM:"AGL Maintenance Manager", AM:"AGL Manager", SEM:"System Eng. Manager",
  HDE:"HD Technical Engineer", OM:"Office Manager", QHS:"QHSE Engineer",
  TL:"AGL Team Leader", SL:"AGL Shift Leader", EL:"Electricians",
  GW:"General Workers", AT:"AGL Technician", MD:"MEWP driver",
  CH:"Store / Chemical handlers", FD:"FMV/ADP Driver"
};
const ROLE_ORDER = ["MM","AM","SEM","HDE","OM","QHS","TL","SL","EL","GW","AT","MD","CH","FD"];
// Map an employee's designation (free text) to role codes in the matrix
const designationToRoleCode = des => {
  if (!des) return null;
  const d = des.toLowerCase();
  if (d.includes("shift leader")) return "SL";
  if (d.includes("team leader") || d.includes("team lead")) return "TL";
  if (d.includes("maintenance manager")) return "MM";
  if (d.includes("agl manager")) return "AM";
  if (d.includes("system")) return "SEM";
  if (d.includes("helpdesk") || d.includes("hd technical")) return "HDE";
  if (d.includes("office")) return "OM";
  if (d.includes("qhse") || d.includes("safety")) return "QHS";
  if (d.includes("electrician")) return "EL";
  if (d.includes("driver") || d.includes("mewp")) return "MD";
  if (d.includes("store") || d.includes("chemical")) return "CH";
  if (d.includes("agl technician") || d.includes("technician")) return "AT";
  return "GW";
};

const TRAINING_CATALOG = [
  {"title": "EAT (GCAS) - Airside Safety Induction Training", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "GAA Induction Training", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "SINYAR HSE Induction", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "SINYAR AVSEC Awareness", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Duties and responsiblities within the abu dhabi airport", "dur": "01h", "mode": "Class", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "SMS manual & standard operating procedures", "dur": "01h", "mode": "Class", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Movement AreaADAC ADP - Airside Driving Permit", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["CH"]},
  {"title": "ADB AGL HSE RE Induction", "dur": "01h", "mode": "eLearning·Int.", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Basic First -Aid", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["QHS", "EL", "AT", "MD", "FD"]},
  {"title": "Electrical Safety + LOTO", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["SL", "EL", "GW", "AT", "MD", "FD"]},
  {"title": "Fire warden", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "FD"]},
  {"title": "Work at Heights Training", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH"]},
  {"title": "Confined Space Awarness Training", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["GW", "AT", "MD", "FD"]},
  {"title": "Power tools safety", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["GW", "AT", "MD", "FD"]},
  {"title": "Crane rigging safety", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["GW", "AT", "CH"]},
  {"title": "banksman safety", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["GW", "AT", "MD", "CH"]},
  {"title": "Defensive Driving", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["GW", "AT", "MD", "CH", "FD"]},
  {"title": "Manual Handling", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["GW", "AT", "MD", "FD"]},
  {"title": "MEWP Driver certificate , IPAF", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["CH"]},
  {"title": "COSHH Assessment training", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["AT", "MD", "FD"]},
  {"title": "ISO Lead auditor courses", "dur": "", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["SEM", "HDE"]},
  {"title": "Near miss , accident  reporting & investigation", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["SL", "EL", "GW", "AT", "FD"]},
  {"title": "ADOSH SF", "dur": "", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["TL"]},
  {"title": "Hand tools safety", "dur": "01h", "mode": "eLearning·Int.", "freq": "Annual", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "FD"]},
  {"title": "Wildlife threats", "dur": "01h", "mode": "eLearning·Int.", "freq": "Annual", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "HSE Orientation", "dur": "01h", "mode": "eLearning·Int.", "freq": "Annual", "type": "HSE", "roles": ["SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "FOD Awareness / preventive procedure", "dur": "01h", "mode": "eLearning·Int.", "freq": "Annual", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Beat the Heat (Heat Stress)", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Fire Emergency Drill", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Speed Limits in Airside and TWYs & RWYs", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Adverse weather condition & weather hazards", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Airside Safety", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Emergency reporting and evacuation procedures", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Environmental Awareness", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Fire safety Awareness", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Permit To Work requirements", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["GW", "AT", "MD"]},
  {"title": "PPE", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Safe driving tips", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Zero Waste awareness (waste reduction and recycling )", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Tower light safety", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Energy and water conservation", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "chemcial and hazardous waste management", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "use of ppe", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "aircraft movement awareness", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Trip & slip hazard", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "proper housekeeping", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "electrical hazard", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Adverse weather condition & weather hazards", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Emergency reporting and evacuation procedures", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "night operations safety", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Manual Handling", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Safe use of hand tools and power tools", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]}
];

/* ============================================================
   HELPERS
   ============================================================ */

const cH = (r, s) => {
  const h = SHIFT_HOURS[s] || { M:8 };
  let sc=0, w=0, mc=0, nc=0, oc=0, lc=0;
  (r || []).forEach(d => {
    if (d.code === "M") { sc += (h.M||8); w += (h.M||8); mc++; }
    else if (d.code === "N") { sc += (h.N||12); w += (h.N||12); nc++; }
    else if (d.code === "O") oc++;
    else if (d.code === "L") lc++;
  });
  return { sc, w, mc, nc, oc, lc };
};

const certSt = exp => {
  if (!exp) return { l:"—", c:theme.td, d:0 };
  const d = (new Date(exp) - new Date()) / 864e5;
  return d < 0 ? { l:"EXPIRED", c:theme.rd, d:Math.ceil(d) }
       : d <= 90 ? { l:"EXPIRING", c:theme.yl, d:Math.ceil(d) }
       : { l:"VALID", c:theme.gn, d:Math.ceil(d) };
};

const fmtDt = iso => {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now - d) / 36e5;
  if (diffH < 1) return Math.max(1, Math.round(diffH*60)) + "m ago";
  if (diffH < 24) return Math.round(diffH) + "h ago";
  if (diffH < 48) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day:"2-digit", month:"short" });
};

const daysInRange = (s, e) => {
  const out = [];
  const d = new Date(s);
  const end = new Date(e);
  while (d <= end) {
    out.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return out;
};

/* ============================================================
   LOGO
   ============================================================ */

const Logo = ({ size=120, w=true }) => (
  <svg viewBox="0 0 280 210" width={size} height={size*210/280} xmlns="http://www.w3.org/2000/svg">
    {/* Stylized aircraft mark in ADB SAFEGATE orange, centered above text */}
    <g transform="translate(140, 8)" fill="#E8702A">
      <path d="M0,0 L5,10 L5,28 L40,46 L40,52 L5,46 L5,64 L16,74 L16,78 L0,73 L-16,78 L-16,74 L-5,64 L-5,46 L-40,52 L-40,46 L-5,28 L-5,10 Z"/>
    </g>
    <text x="140" y="140" textAnchor="middle" fontFamily="'Arial Black',Impact,sans-serif" fontSize="42" fontWeight="900" fill={w?"#fff":"#1b4d62"} letterSpacing="3">ADB</text>
    <text x="140" y="190" textAnchor="middle" fontFamily="'Arial Black',Impact,sans-serif" fontSize="42" fontWeight="900" fill={w?"#fff":"#1b4d62"} letterSpacing="3">SAFEGATE</text>
  </svg>
);

/* ============================================================
   SHARED UI
   ============================================================ */

const ib = {
  width:"100%", padding:"10px 14px", borderRadius:10,
  border:`1px solid ${theme.bl}`, background:"rgba(255,255,255,0.05)",
  color:theme.tx, fontSize:13, outline:"none", boxSizing:"border-box"
};

const Bd = ({ text, color }) => (
  <span style={{
    padding:"4px 12px", borderRadius:20, fontSize:10, fontWeight:700,
    background:`${color}18`, color, border:`1px solid ${color}30`, whiteSpace:"nowrap"
  }}>{text}</span>
);

const Bt = ({ children, onClick, bg=theme.pl, color="#fff", outline=false, small=false, disabled=false }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: small ? "6px 14px" : "10px 20px",
    borderRadius:10,
    border: outline ? `1px solid ${theme.bl}` : "none",
    background: disabled ? "rgba(255,255,255,0.05)" : (outline ? "transparent" : bg),
    color: disabled ? theme.td : (outline ? theme.ts : color),
    fontSize: small ? 12 : 13,
    fontWeight:600,
    cursor: disabled ? "not-allowed" : "pointer"
  }}>{children}</button>
);

const SC2 = ({ label, value, color, icon, sub }) => (
  <div style={{
    background:theme.card, borderRadius:14, padding:"18px 16px",
    flex:"1 1 150px", border:`1px solid ${theme.bd}`, minWidth:140,
    position:"relative", overflow:"hidden"
  }}>
    <div style={{ position:"absolute", top:-8, right:-8, fontSize:48, opacity:0.06 }}>{icon}</div>
    <div style={{ fontSize:13, color:theme.td, marginBottom:6, fontWeight:500 }}>{label}</div>
    <div style={{ fontSize:28, fontWeight:800, color }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:theme.td, marginTop:4 }}>{sub}</div>}
  </div>
);

const Sec = ({ title, icon, children, action }) => (
  <div style={{ background:theme.card, borderRadius:14, padding:22, marginBottom:18, border:`1px solid ${theme.bd}` }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
      <h3 style={{ fontSize:15, fontWeight:700, color:theme.tx, display:"flex", alignItems:"center", gap:8, margin:0 }}>
        {icon} {title}
      </h3>
      {action}
    </div>
    {children}
  </div>
);

const Fd = ({ label, value, editing, onChange, type="text" }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5, letterSpacing:1, textTransform:"uppercase" }}>{label}</label>
    {editing
      ? <input type={type} value={value || ""} onChange={e=>onChange(e.target.value)}
          style={{...ib, borderColor:theme.or, background:"rgba(255,255,255,0.08)"}} />
      : <div style={{...ib, background:"transparent", borderColor:theme.bd}}>{value || "—"}</div>}
  </div>
);

const Modal = ({ title, onClose, children, width=560 }) => (
  <div onClick={onClose} className="modal-bg" style={{
    position:"fixed", inset:0, background:"rgba(0,0,0,0.6)",
    backdropFilter:"blur(4px)", zIndex:1000, display:"flex",
    alignItems:"center", justifyContent:"center", padding:20
  }}>
    <div onClick={e=>e.stopPropagation()} className="modal-panel" style={{
      background:theme.cs, borderRadius:16, padding:24, border:`1px solid ${theme.bl}`,
      width:"100%", maxWidth:width, maxHeight:"90vh", overflowY:"auto",
      boxShadow:"0 24px 80px rgba(0,0,0,0.5)"
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <h3 style={{ fontSize:17, fontWeight:700, color:theme.tx, margin:0 }}>{title}</h3>
        <button onClick={onClose} style={{
          background:"none", border:"none", color:theme.td,
          fontSize:22, cursor:"pointer", padding:4, lineHeight:1
        }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const Empty = ({ icon="📭", text="No records yet" }) => (
  <div style={{ textAlign:"center", padding:"30px 16px", color:theme.td }}>
    <div style={{ fontSize:32, marginBottom:8, opacity:0.5 }}>{icon}</div>
    <div style={{ fontSize:13 }}>{text}</div>
  </div>
);

/* ============================================================
   SUPABASE CLIENT + FIELD MAPPERS
   ============================================================ */

const SUPABASE_URL = "https://vzipsbecmirbkrbrpcdt.supabase.co";
const SUPABASE_KEY = "sb_publishable_c6qyKoJaPEyTQ3-8nv7oFg_i3waClyQ";
const supa = (typeof window !== "undefined" && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const empToDb = e => ({
  id: e.id, email: e.email,
  name: e.name, section: e.section,
  designation: e.designation, shift: e.shift, role: e.role || "employee",
  nationality: e.nationality, mobile: e.mobile, emp_no: e.empNo,
  dob: e.dob || null, marital_status: e.maritalStatus, address: e.address,
  join_date: e.joinDate || null,
  emergency_contact: e.emergencyContact, emergency_name: e.emergencyName,
  passport_no: e.passportNo, passport_expiry: e.passportExpiry || null,
  visa_expiry: e.visaExpiry || null, eid_no: e.eidNo, eid_expiry: e.eidExpiry || null,
  annual_leave: e.annualLeave ?? 30, used_annual: e.usedAnnual ?? 0,
  sick_leave: e.sickLeave ?? 15, used_sick: e.usedSick ?? 0, comp_off: e.compOff ?? 0,
  roster: e.roster || {}, achievements: e.achievements || [],
  warnings: e.warnings || [], actions: e.actions || [],
  training: e.training || [], documents: e.documents || [],
  rating: e.rating || {},
  profile_finalized: !!e.profileFinalized,
  tier: e.tier || null,
});
const empFromDb = r => ({
  id: r.id, email: r.email,
  name: r.name, section: r.section,
  designation: r.designation, shift: r.shift, role: r.role,
  nationality: r.nationality, mobile: r.mobile, empNo: r.emp_no,
  dob: r.dob || "", maritalStatus: r.marital_status || "", address: r.address || "",
  joinDate: r.join_date || "",
  emergencyContact: r.emergency_contact || "", emergencyName: r.emergency_name || "",
  passportNo: r.passport_no || "", passportExpiry: r.passport_expiry || "",
  visaExpiry: r.visa_expiry || "", eidNo: r.eid_no || "", eidExpiry: r.eid_expiry || "",
  annualLeave: r.annual_leave, usedAnnual: r.used_annual,
  sickLeave: r.sick_leave, usedSick: r.used_sick, compOff: r.comp_off,
  roster: r.roster || {}, achievements: r.achievements || [],
  warnings: r.warnings || [], actions: r.actions || [],
  training: r.training || [], documents: r.documents || [],
  rating: r.rating || {},
  profileFinalized: !!r.profile_finalized,
  tier: r.tier || "",
});

const lrToDb = r => ({
  id: r.id, emp_id: r.empId, emp_name: r.empName, section: r.section,
  type: r.type, start_date: r.startDate || null, end_date: r.endDate || null,
  days: r.days, reason: r.reason, status: r.status,
  applied_on: r.appliedOn || new Date().toISOString(),
  tl_comment: r.tlComment || "", mgr_comment: r.mgrComment || "",
  tl_action_date: r.tlActionDate || null, mgr_action_date: r.mgrActionDate || null,
  tl_name: r.tlName || "", mgr_name: r.mgrName || "",
});
const lrFromDb = r => ({
  id: r.id, empId: r.emp_id, empName: r.emp_name, section: r.section,
  type: r.type, startDate: r.start_date || "", endDate: r.end_date || "",
  days: r.days, reason: r.reason || "", status: r.status,
  appliedOn: r.applied_on || "",
  tlComment: r.tl_comment || "", mgrComment: r.mgr_comment || "",
  tlActionDate: r.tl_action_date || "", mgrActionDate: r.mgr_action_date || "",
  tlName: r.tl_name || "", mgrName: r.mgr_name || "",
});

const annToDb = a => ({
  id: a.id, title: a.title, message: a.message, priority: a.priority,
  pinned: !!a.pinned, date: a.date || new Date().toISOString(),
  by_user: a.by || "", target: a.target || "all",
});
const annFromDb = r => ({
  id: r.id, title: r.title, message: r.message || "", priority: r.priority || "info",
  pinned: !!r.pinned, date: r.date || "", by: r.by_user || "", target: r.target || "all",
});

const nfToDb = n => ({
  id: n.id, to_user: n.to, type: n.type, message: n.message,
  read: !!n.read, date: n.date || new Date().toISOString(),
});
const nfFromDb = r => ({
  id: r.id, to: r.to_user, type: r.type, message: r.message || "",
  read: !!r.read, date: r.date || "",
});

// Returns the rows in `next` whose serialized form differs from `prev`
// (or that aren't in `prev` at all). Used so we only push rows that
// actually changed, instead of upserting the whole table on every edit
// (RLS would reject the bulk write since users can only modify their own rows).
function diffById(prev, next) {
  const prevMap = new Map(prev.map(r => [r.id, r]));
  return next.filter(r => {
    const p = prevMap.get(r.id);
    return !p || JSON.stringify(p) !== JSON.stringify(r);
  });
}

/* ============================================================
   MAIN APP
   ============================================================ */

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [nav, setNav] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);
  const [viewEmployee, setViewEmployee] = useState(null);
  const [leaveRequests, setLeaveRequests] = useState(INITIAL_LEAVE_REQUESTS);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [announcements, setAnnouncements] = useState(INITIAL_ANNOUNCEMENTS);
  const [nextLrId, setNextLrId] = useState(5);
  const [nextAnnId, setNextAnnId] = useState(6);
  const [selectedMonth, setSelectedMonth] = useState(3); // April
  const [showNotif, setShowNotif] = useState(false);

  // --- Persistence: Supabase Auth + Supabase DB (tables RLS-protected)
  //   Data is only loaded once the user has an authenticated session.
  const LOCAL_KEY = "adb-portal-local-v2";
  const hydrated = useRef(false);
  const prevEmployeesRef     = useRef([]);
  const prevLeaveRequestsRef = useRef([]);
  const prevAnnouncementsRef = useRef([]);
  const prevNotificationsRef = useRef([]);

  // Load UI-only state from localStorage immediately
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.notifications)) setNotifications(d.notifications);
        if (typeof d.nextLrId === "number") setNextLrId(d.nextLrId);
        if (typeof d.nextAnnId === "number") setNextAnnId(d.nextAnnId);
      }
    } catch {}
  }, []);

  // Load all team data from Supabase for an authenticated user
  const loadPortalData = useCallback(async (authEmail) => {
    try {
      const [empsR, lrsR, annsR, nfsR] = await Promise.all([
        supa.from("employees").select("*").order("id"),
        supa.from("leave_requests").select("*").order("applied_on", { ascending: false }),
        supa.from("announcements").select("*").order("date", { ascending: false }),
        supa.from("notifications").select("*").order("date", { ascending: false }),
      ]);
      if (empsR.error) console.error("[portal] employees load:", empsR.error);
      if (lrsR.error)  console.error("[portal] leaves load:",    lrsR.error);
      if (annsR.error) console.error("[portal] anns load:",      annsR.error);
      if (nfsR.error)  console.error("[portal] notifs load:",    nfsR.error);

      const emps = (empsR.data || []).map(empFromDb);
      const matches = emps.filter(e => e.email?.toLowerCase() === authEmail?.toLowerCase());
      const me = matches[0];
      if (!me) {
        console.warn("[portal] authenticated email has no employee record:", authEmail);
        alert("Your email (" + authEmail + ") is not registered as an employee. Please contact your admin.");
        await supa.auth.signOut();
        return;
      }
      const lrs  = (lrsR.data  || []).map(lrFromDb);
      const anns = (annsR.data || []).map(annFromDb);
      setEmployees(emps);
      setLeaveRequests(lrs);
      setAnnouncements(anns);
      prevEmployeesRef.current     = emps;
      prevLeaveRequestsRef.current = lrs;
      prevAnnouncementsRef.current = anns;
      // Seed notifications if empty
      let nfs;
      if (!nfsR.data || nfsR.data.length === 0) {
        await supa.from("notifications").upsert(INITIAL_NOTIFICATIONS.map(nfToDb));
        const { data } = await supa.from("notifications").select("*").order("date", { ascending: false });
        nfs = (data || []).map(nfFromDb);
      } else {
        nfs = nfsR.data.map(nfFromDb);
      }
      setNotifications(nfs);
      prevNotificationsRef.current = nfs;
      setCurrentUser(me);

      // Realtime
      if (!window.__portalChannel) {
        window.__portalChannel = supa.channel("portal")
          .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, async () => {
            const { data } = await supa.from("employees").select("*").order("id");
            if (data) {
              const fresh = data.map(empFromDb);
              prevEmployeesRef.current = fresh;
              setEmployees(fresh);
            }
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, async () => {
            const { data } = await supa.from("leave_requests").select("*").order("applied_on", { ascending: false });
            if (data) {
              const fresh = data.map(lrFromDb);
              prevLeaveRequestsRef.current = fresh;
              setLeaveRequests(fresh);
            }
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, async () => {
            const { data } = await supa.from("announcements").select("*").order("date", { ascending: false });
            if (data) {
              const fresh = data.map(annFromDb);
              prevAnnouncementsRef.current = fresh;
              setAnnouncements(fresh);
            }
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, async (payload) => {
            const fresh = nfFromDb(payload.new);
            setNotifications(p => {
              if (p.some(n => n.id === fresh.id)) return p;
              const next = [fresh, ...p];
              prevNotificationsRef.current = next;
              return next;
            });
            // Browser toast if this notif is for the logged-in user
            try {
              if (typeof window !== "undefined" && window.__currentUserId === fresh.to
                  && "Notification" in window && Notification.permission === "granted") {
                const n = new Notification("ADB AGL Portal", {
                  body: fresh.message, icon: "/icon-192.png", badge: "/icon-192.png", tag: fresh.id,
                });
                n.onclick = () => { window.focus(); n.close(); };
              }
            } catch (e) { console.warn("notif display error", e); }
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, async (payload) => {
            const fresh = nfFromDb(payload.new);
            setNotifications(p => {
              const next = p.map(n => n.id === fresh.id ? fresh : n);
              prevNotificationsRef.current = next;
              return next;
            });
          })
          .subscribe();
      }
    } catch (e) {
      console.error("[portal] loadPortalData error:", e);
    }
  }, []);

  // Session management: restore existing session on mount, react to sign-in/out
  useEffect(() => {
    if (!supa) { hydrated.current = true; return; }
    let mounted = true;

    const handle = async (session) => {
      if (!mounted) return;
      if (session?.user?.email) {
        await loadPortalData(session.user.email);
      } else {
        setCurrentUser(null);
        setEmployees([]);
        setLeaveRequests([]);
        setAnnouncements([]);
      }
      hydrated.current = true;
    };

    supa.auth.getSession().then(({ data }) => handle(data.session));
    const { data: { subscription } } = supa.auth.onAuthStateChange((_event, session) => handle(session));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [loadPortalData]);

  // Save UI-only state (notifications + counters) to localStorage
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({
        notifications, nextLrId, nextAnnId,
      }));
    } catch {}
  }, [notifications, nextLrId, nextAnnId]);

  // Debounced upsert: only rows that actually changed are pushed.
  // RLS policies restrict each user to writing rows they own/can manage,
  // so bulk-upserting the whole table would be rejected.
  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const changed = diffById(prevEmployeesRef.current, employees);
      prevEmployeesRef.current = employees;
      if (!changed.length) return;
      supa.from("employees").upsert(changed.map(empToDb))
        .then(r => r.error && console.error("employees upsert:", r.error));
    }, 400);
    return () => clearTimeout(t);
  }, [employees]);

  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const changed = diffById(prevLeaveRequestsRef.current, leaveRequests);
      prevLeaveRequestsRef.current = leaveRequests;
      if (!changed.length) return;
      supa.from("leave_requests").upsert(changed.map(lrToDb))
        .then(r => r.error && console.error("leave_requests upsert:", r.error));
    }, 400);
    return () => clearTimeout(t);
  }, [leaveRequests]);

  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const changed = diffById(prevAnnouncementsRef.current, announcements);
      prevAnnouncementsRef.current = announcements;
      if (!changed.length) return;
      supa.from("announcements").upsert(changed.map(annToDb))
        .then(r => r.error && console.error("announcements upsert:", r.error));
    }, 400);
    return () => clearTimeout(t);
  }, [announcements]);

  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const changed = diffById(prevNotificationsRef.current, notifications);
      prevNotificationsRef.current = notifications;
      if (!changed.length) return;
      supa.from("notifications").upsert(changed.map(nfToDb))
        .then(r => r.error && console.error("notifications upsert:", r.error));
    }, 400);
    return () => clearTimeout(t);
  }, [notifications]);

  // Expose currentUser.id for the realtime callback to check incoming notifs
  useEffect(() => {
    if (typeof window !== "undefined") window.__currentUserId = currentUser?.id || null;
  }, [currentUser]);

  const all = useMemo(() => employees, [employees]);

  // Log in via Supabase Auth. If the auth user doesn't exist yet (first-ever
  // login for this employee), auto-sign them up with the given password.
  const login = useCallback(async () => {
    if (!supa) { setLoginError("Backend unavailable"); return; }
    const email = loginId.trim().toLowerCase();
    if (!email.includes("@")) { setLoginError("Please enter your email"); return; }
    if (!loginPassword) { setLoginError("Enter your password"); return; }

    setLoginError("Signing in…");
    const r = await supa.auth.signInWithPassword({ email, password: loginPassword });
    if (r.error) {
      const msg = (r.error.message || "").toLowerCase();
      // "Email not confirmed" — auth user exists but hasn't clicked the email link yet
      if (msg.includes("not confirmed") || msg.includes("email not confirmed")) {
        setLoginError("Please check your inbox and click the confirmation link, then sign in again.");
        return;
      }
      // "Invalid login credentials" — could be wrong password OR first-time login.
      // Try first-time signup with these credentials.
      const s = await supa.auth.signUp({ email, password: loginPassword });
      if (s.error) {
        setLoginError(s.error.message || "Invalid email or password");
        return;
      }
      // If a session came back, email-confirmation is OFF → onAuthStateChange handles it.
      // Otherwise, Supabase sent a confirmation email; tell the user to check it.
      if (!s.data?.session) {
        setLoginError("We sent a confirmation email to " + email + ". Click the link, then sign in.");
        return;
      }
    }
    setLoginError("");
    // onAuthStateChange will load data and set currentUser
  }, [loginId, loginPassword]);

  const logout = useCallback(async () => {
    if (supa) { try { await supa.auth.signOut(); } catch {} }
    if (window.__portalChannel) { try { window.__portalChannel.unsubscribe(); } catch {} window.__portalChannel = null; }
    setLoginId(""); setLoginPassword(""); setLoginError("");
    setNav("dashboard"); setViewEmployee(null);
  }, []);

  const changePassword = useCallback(async (oldPw, newPw) => {
    if (!supa) return false;
    // Verify the old password first by re-authenticating
    const { error } = await supa.auth.signInWithPassword({ email: currentUser.email, password: oldPw });
    if (error) return false;
    const upd = await supa.auth.updateUser({ password: newPw });
    if (upd.error) { console.error(upd.error); return false; }
    setNav("dashboard");
    return true;
  }, [currentUser]);

  const saveProfile = useCallback(u => {
    setEmployees(p => p.map(e => e.id === u.id ? { ...e, ...u } : e));
    if (viewEmployee?.id === u.id) setViewEmployee(p => ({ ...p, ...u }));
    if (currentUser?.id === u.id) setCurrentUser(p => ({ ...p, ...u }));
  }, [viewEmployee, currentUser]);

  // Manager creates an "invite" row. The employee will sign up with this email
  // via Supabase auth and be matched to the row by email in loadPortalData.
  const addInviteEmployee = useCallback(({ email, name, section, designation, role, tier }) => {
    const trimmedEmail = (email || "").trim().toLowerCase();
    if (!trimmedEmail || !name?.trim()) {
      return { ok: false, error: "Email and name are required" };
    }
    if (employees.some(e => e.email?.toLowerCase() === trimmedEmail)) {
      return { ok: false, error: "That email is already registered" };
    }
    const id = nextEmpId(employees, role);
    const newEmp = {
      id,
      email: trimmedEmail,
      name: name.trim(),
      section: section || "",
      designation: designation || "",
      shift: "",
      role: role || "employee",
      profileFinalized: false,
      annualLeave: 30, usedAnnual: 0,
      sickLeave: 15,  usedSick: 0,
      compOff: 0,
      roster: {}, achievements: [], warnings: [], actions: [],
      training: [], documents: [],
      rating: {},
      tier: tier || "",
    };
    setEmployees(p => [...p, newEmp]);
    return { ok: true, id };
  }, [employees]);

  // Bulk invite from a parsed CSV. rows: [{ email, name, section, designation, role, tier }]
  // Returns counts + a per-row outcome list so the UI can show what happened.
  const addInviteEmployeesBulk = useCallback((rows) => {
    const existingByEmail = new Map(
      employees.filter(e => e.email).map(e => [e.email.toLowerCase(), e])
    );
    const acc = [...employees];
    const outcomes = [];

    rows.forEach((row, i) => {
      const email = (row.email || "").trim().toLowerCase();
      const name  = (row.name  || "").trim();
      if (!email || !email.includes("@")) {
        outcomes.push({ line: i + 1, email: row.email, status: "error", reason: "missing or invalid email" });
        return;
      }
      if (!name) {
        outcomes.push({ line: i + 1, email, status: "error", reason: "missing name" });
        return;
      }
      if (existingByEmail.has(email)) {
        outcomes.push({ line: i + 1, email, status: "skipped", reason: "email already exists" });
        return;
      }
      const role = ["employee","teamlead","manager"].includes((row.role || "").toLowerCase())
        ? (row.role || "").toLowerCase() : "employee";
      const tierIn = (row.tier || "").trim().toUpperCase();
      const tier = TIERS_CAP.includes(tierIn) ? tierIn : "";
      const id = nextEmpId(acc, role);
      const newEmp = {
        id, email, name,
        section: row.section || "",
        designation: row.designation || "",
        shift: "",
        role,
        profileFinalized: false,
        annualLeave: 30, usedAnnual: 0,
        sickLeave: 15,  usedSick: 0,
        compOff: 0,
        roster: {}, achievements: [], warnings: [], actions: [],
        training: [], documents: [],
        rating: {},
        tier,
      };
      acc.push(newEmp);
      existingByEmail.set(email, newEmp);
      outcomes.push({ line: i + 1, email, status: "created", id, tier });
    });

    setEmployees(acc);
    return {
      total: rows.length,
      created: outcomes.filter(o => o.status === "created").length,
      skipped: outcomes.filter(o => o.status === "skipped").length,
      errors:  outcomes.filter(o => o.status === "error").length,
      outcomes,
    };
  }, [employees]);

  const addEmployeeAction = useCallback((eid, form) => {
    const item = {
      id: Date.now(), title: form.title, desc: form.desc,
      date: new Date().toISOString().split("T")[0], by: currentUser.name
    };
    const upd = e => {
      if (form.type === "achievement") return { ...e, achievements:[...(e.achievements||[]), item] };
      if (form.type === "warning") return { ...e, warnings:[...(e.warnings||[]), { ...item, severity:"minor" }] };
      return { ...e, actions:[...(e.actions||[]), { ...item, type:form.type }] };
    };
    setEmployees(p => p.map(e => e.id === eid ? upd(e) : e));
    if (viewEmployee?.id === eid) setViewEmployee(p => upd(p));
  }, [currentUser, viewEmployee]);

  const submitLeave = useCallback(form => {
    const id = `LR-${String(nextLrId).padStart(3,"0")}`;
    setNextLrId(p => p + 1);
    setLeaveRequests(p => [{
      id, empId:currentUser.id, empName:currentUser.name, section:currentUser.section || "",
      type:form.type, startDate:form.startDate, endDate:form.endDate, days:form.days, reason:form.reason,
      status:"pending", appliedOn: new Date().toISOString(),
      tlComment:"", mgrComment:"", tlActionDate:"", mgrActionDate:"", tlName:"", mgrName:""
    }, ...p]);
    setNotifications(p => [{ id: nfId(), to:"TL-001", type:"new_request",
      message:`New leave: ${currentUser.name} - ${form.type} (${form.days}d)`,
      read:false, date:new Date().toISOString()
    }, ...p]);
  }, [currentUser, nextLrId]);

  const leaveAction = useCallback((rid, action, comment) => {
    setLeaveRequests(prev => prev.map(r => {
      if (r.id !== rid) return r;
      const now = new Date().toISOString();
      if (currentUser.role === "teamlead") {
        if (action === "approve") {
          setNotifications(p => [{ id: nfId(), to:"MGR-001", type:"new_request",
            message:`${r.empName}'s leave approved by TL`, read:false, date:now }, ...p]);
          return { ...r, status:"tl_approved", tlComment:comment||"Approved", tlActionDate:now, tlName:currentUser.name };
        } else {
          setNotifications(p => [{ id: nfId(), to:r.empId, type:"rejected",
            message:`${r.type} rejected by TL: ${comment||"Rejected"}`, read:false, date:now }, ...p]);
          return { ...r, status:"rejected", tlComment:comment||"Rejected", tlActionDate:now, tlName:currentUser.name };
        }
      }
      if (currentUser.role === "manager") {
        if (action === "approve") {
          setNotifications(p => [{ id: nfId(), to:r.empId, type:"approved",
            message:`${r.type} APPROVED ✅`, read:false, date:now }, ...p]);
          return { ...r, status:"approved", mgrComment:comment||"Approved", mgrActionDate:now, mgrName:currentUser.name };
        } else {
          setNotifications(p => [{ id: nfId(), to:r.empId, type:"rejected",
            message:`${r.type} rejected by Manager`, read:false, date:now }, ...p]);
          return { ...r, status:"rejected", mgrComment:comment||"Rejected", mgrActionDate:now, mgrName:currentUser.name };
        }
      }
      return r;
    }));
  }, [currentUser]);

  const editRoster = useCallback((eid, mk, day, newCode) => {
    setEmployees(prev => prev.map(e => {
      if (e.id !== eid) return e;
      const r = (e.roster?.[mk] || []).map(d => d.day === day ? { ...d, code:newCode } : d);
      return { ...e, roster:{ ...e.roster, [mk]:r } };
    }));
  }, []);

  const addDoc = useCallback((eid, doc) => {
    const item = { id:Date.now(), ...doc };
    setEmployees(p => p.map(e => e.id === eid ? { ...e, documents:[...(e.documents||[]), item] } : e));
    if (currentUser?.id === eid) setCurrentUser(p => ({ ...p, documents:[...(p.documents||[]), item] }));
    if (viewEmployee?.id === eid) setViewEmployee(p => ({ ...p, documents:[...(p.documents||[]), item] }));
  }, [currentUser, viewEmployee]);

  const delDoc = useCallback((eid, did) => {
    setEmployees(p => p.map(e => e.id === eid ? { ...e, documents:(e.documents||[]).filter(d => d.id !== did) } : e));
    if (currentUser?.id === eid) setCurrentUser(p => ({ ...p, documents:(p.documents||[]).filter(d => d.id !== did) }));
    if (viewEmployee?.id === eid) setViewEmployee(p => ({ ...p, documents:(p.documents||[]).filter(d => d.id !== did) }));
  }, [currentUser, viewEmployee]);

  const addAnn = useCallback(a => {
    const id = `ANN-${String(nextAnnId).padStart(3,"0")}`;
    setNextAnnId(p => p + 1);
    const newAnn = {
      id, title:a.title, message:a.message, priority:a.priority,
      pinned:a.pinned || false, date:new Date().toISOString(),
      by:currentUser.name, target:a.target || "all"
    };
    setAnnouncements(p => [newAnn, ...p]);
    // Notify all targeted employees
    const targets = a.target === "all"
      ? employees.map(e => e.id)
      : employees.filter(e => e.section === a.target).map(e => e.id);
    setNotifications(p => [
      ...targets.map((eid, i) => ({ id: nfId(), to:eid, type:"announcement",
        message:`📢 ${a.title}`, read:false, date:new Date().toISOString(), annId:id
      })),
      ...p
    ]);
  }, [nextAnnId, currentUser, employees]);

  const delAnn = useCallback(id => {
    setAnnouncements(p => p.filter(a => a.id !== id));
  }, []);

  const markNotifRead = useCallback(nid => {
    setNotifications(p => p.map(n => n.id === nid ? { ...n, read:true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    if (!currentUser) return;
    setNotifications(p => p.map(n => n.to === currentUser.id ? { ...n, read:true } : n));
  }, [currentUser]);

  const mn = currentUser ? notifications.filter(n => n.to === currentUser.id && !n.read) : [];
  const myNotifs = currentUser ? notifications.filter(n => n.to === currentUser.id) : [];
  const pc = currentUser
    ? (currentUser.role === "teamlead" ? leaveRequests.filter(r => r.status === "pending").length
      : currentUser.role === "manager" ? leaveRequests.filter(r => r.status === "tl_approved").length : 0)
    : 0;

  // LOGIN PAGE
  if (!currentUser) return <LoginPage loginId={loginId} loginPassword={loginPassword} loginError={loginError} setLoginId={setLoginId} setLoginPassword={setLoginPassword} login={login} />;

  const iM = currentUser.role !== "employee";
  const iMgr = currentUser.role === "manager";
  const isTL = currentUser.role === "teamlead";
  // Manager doesn't see the raw Working Hours roster — that's a TL concern.
  const ni = iMgr ? NM.filter(n => n.key !== "attendance") : iM ? NM : NE;

  // Save an employee's rating (TL or MGR); salary tier editable by MGR only
  const saveRating = (empId, patch) => {
    const apply = e => {
      const prev = e.rating || {};
      const next = { ...prev, ...patch, updatedAt: new Date().toISOString(), updatedBy: currentUser.name };
      if (!iMgr) delete next.tier; // non-managers can't set tier
      return { ...e, rating: next };
    };
    setEmployees(p => p.map(e => e.id === empId ? apply(e) : e));
    if (viewEmployee?.id === empId) setViewEmployee(p => apply(p));
  };
  const rb = currentUser.role === "employee"
    ? { l:"Employee", c:theme.gn }
    : currentUser.role === "teamlead"
      ? { l:"Team Leader", c:theme.yl }
      : { l:"Manager", c:theme.pu };

  if (nav === "changepw") {
    return <ChPw user={currentUser} onCh={changePassword} forced={currentUser.initialPassword} onOut={logout} />;
  }

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:theme.bg }}>
      {/* SIDEBAR */}
      <div style={{
        width: sidebarOpen ? 230 : 56, transition:"width 0.3s",
        background:"rgba(13,31,48,0.95)", borderRight:`1px solid ${theme.bd}`,
        display:"flex", flexDirection:"column", overflow:"hidden", flexShrink:0
      }}>
        <div style={{
          padding: sidebarOpen ? "16px 14px" : "16px 8px", borderBottom:`1px solid ${theme.bd}`,
          display:"flex", alignItems:"center", gap:10,
          justifyContent: sidebarOpen ? "flex-start" : "center"
        }}>
          {sidebarOpen
            ? <Logo size={110} w={true} />
            : <div style={{
                width:30, height:30, borderRadius:8, background:theme.ga,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:10, fontWeight:900, color:"#fff"
              }}>AS</div>
          }
        </div>
        <div style={{ flex:1, padding:"10px 6px", overflowY:"auto" }}>
          {ni.map(it => {
            const isA = nav === it.key;
            const bd2 = it.key === "approvals" && pc > 0;
            return (
              <div key={it.key} onClick={() => { setNav(it.key); setViewEmployee(null); setShowNotif(false); }}
                style={{
                  display:"flex", alignItems:"center", gap:8,
                  padding: sidebarOpen ? "9px 12px" : "9px 0",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                  borderRadius:10, marginBottom:2, cursor:"pointer",
                  background: isA ? "rgba(232,112,42,0.12)" : "transparent",
                  color: isA ? theme.or : theme.td, fontSize:13, position:"relative"
                }}>
                <span style={{ fontSize:16 }}>{it.icon}</span>
                {sidebarOpen && <span style={{ fontWeight: isA ? 700 : 400, fontSize:12 }}>{it.label}</span>}
                {bd2 && <span style={{
                  position:"absolute", top:3, right: sidebarOpen ? 8 : 0,
                  width:16, height:16, borderRadius:"50%",
                  background:theme.rd, color:"#fff", fontSize:8, fontWeight:800,
                  display:"flex", alignItems:"center", justifyContent:"center"
                }}>{pc}</span>}
              </div>
            );
          })}
        </div>
        <div style={{
          padding: sidebarOpen ? "12px 14px" : "12px 6px", borderTop:`1px solid ${theme.bd}`,
          display:"flex", alignItems:"center", gap:8,
          justifyContent: sidebarOpen ? "flex-start" : "center"
        }}>
          <div style={{
            width:30, height:30, borderRadius:10, background:theme.gp,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:11, fontWeight:800, color:"#fff"
          }}>{currentUser.name.split(" ").map(n => n[0]).join("").slice(0,2)}</div>
          {sidebarOpen && (
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ color:theme.tx, fontSize:11, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentUser.name}</div>
              <div style={{ fontSize:9, color:rb.c, fontWeight:700 }}>{rb.l}</div>
            </div>
          )}
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
        <div style={{
          height:52, background:"rgba(13,31,48,0.9)",
          borderBottom:`1px solid ${theme.bd}`,
          display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px",
          position:"sticky", top:0, zIndex:10
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
              background:"none", border:"none", color:theme.td, cursor:"pointer", fontSize:18
            }}>☰</button>
            <h1 style={{ color:theme.tx, fontSize:16, fontWeight:700, margin:0 }}>
              {viewEmployee ? viewEmployee.name : (ni.find(n => n.key === nav)?.label || "")}
            </h1>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, position:"relative" }}>
            <div onClick={() => setShowNotif(!showNotif)} style={{ position:"relative", cursor:"pointer", padding:4 }}>
              <span style={{ fontSize:18 }}>🔔</span>
              {mn.length > 0 && (
                <span style={{
                  position:"absolute", top:-2, right:-4, width:16, height:16, borderRadius:"50%",
                  background:theme.rd, color:"#fff", fontSize:9, fontWeight:800,
                  display:"flex", alignItems:"center", justifyContent:"center"
                }}>{mn.length}</span>
              )}
            </div>
            {showNotif && (
              <NotifPanel
                notifs={myNotifs}
                onClose={() => setShowNotif(false)}
                onMarkRead={markNotifRead}
                onMarkAll={markAllRead}
                onGoTo={(key) => { setNav(key); setViewEmployee(null); setShowNotif(false); }}
              />
            )}
            <Bd text={rb.l} color={rb.c} />
            <button onClick={logout} style={{
              background:theme.card, border:`1px solid ${theme.bd}`, borderRadius:8,
              color:theme.ts, padding:"5px 12px", fontSize:11, cursor:"pointer", fontWeight:600
            }}>Logout</button>
          </div>
        </div>

        <div style={{
          flex:1, padding:20, overflowY:"auto",
          background:"radial-gradient(ellipse at 50% 0%,rgba(21,66,95,0.08) 0%,transparent 50%)"
        }}>
          {viewEmployee ? (
            <div className="fade-in">
              <Bt onClick={() => setViewEmployee(null)} outline={true} small={true}>← Back</Bt>
              <div style={{ marginTop:12 }}>
                <Prof emp={viewEmployee} canEdit={iM} isStaff={iM} isMgr={iMgr} onSave={saveProfile} onAdd={addEmployeeAction} onAddDoc={addDoc} onDelDoc={delDoc} />
              </div>
            </div>
          ) : (
            <div className="fade-in" key={nav}>
              {nav === "dashboard" && (iM
                ? <MDash user={currentUser} employees={employees} leaveRequests={leaveRequests} notifications={notifications} announcements={announcements} pc={pc} onGoTo={setNav} />
                : <EDash user={currentUser} notifications={notifications} announcements={announcements} onGoTo={setNav} />)}
              {nav === "profile" && <Prof emp={currentUser} canEdit={iM || !currentUser.profileFinalized} isStaff={iM} isMgr={iMgr} onSave={saveProfile} onAdd={addEmployeeAction} onAddDoc={addDoc} onDelDoc={delDoc} />}
              {nav === "team" && <Team employees={employees} onSel={setViewEmployee} isMgr={iMgr} isTL={isTL} onInvite={addInviteEmployee} onBulkInvite={addInviteEmployeesBulk} />}
              {nav === "performance" && iM && <Perf employees={employees} onSel={setViewEmployee} isMgr={iMgr} onSave={saveRating} />}
              {nav === "leave" && <LvPg user={currentUser} leaveRequests={leaveRequests} onSub={submitLeave} onAct={leaveAction} />}
              {nav === "approvals" && <ApPg user={currentUser} leaveRequests={leaveRequests} onAct={leaveAction} />}
              {nav === "calendar" && <LeaveCalendar leaveRequests={leaveRequests} employees={employees} />}
              {nav === "attendance" && !iMgr && (iM
                ? <AttPg employees={employees} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} onEditRoster={editRoster} canEdit={iM} />
                : <MyAtt emp={currentUser} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />)}
              {nav === "training" && (iM ? <TrMgmt employees={employees} /> : <MyTr emp={currentUser} />)}
              {nav === "documents" && (iM ? <DocsMgmt employees={employees} onSel={setViewEmployee} /> : <MyDocs emp={currentUser} onAdd={addDoc} onDel={delDoc} />)}
              {nav === "announcements" && <AnnPg user={currentUser} announcements={announcements} employees={employees} onAdd={addAnn} onDel={delAnn} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   LOGIN
   ============================================================ */

function LoginPage({ loginId, loginPassword, loginError, setLoginId, setLoginPassword, login }) {
  const dm = [
    { id:"amarnath.munderi@adbsafegate.ae", pw:"Adb@2026", l:"Employee (Amarnath)", i:"👷" },
    { id:"mohammed.faheem@adbsafegate.ae", pw:"Adb@2026", l:"Team Leader (Faheem)", i:"👨‍💼" },
    { id:"ragesh.menon@adbsafegate.ae", pw:"Adb@2026", l:"Manager (Ragesh)", i:"👔" }
  ];
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:theme.bg }}>
      <div style={{
        position:"absolute", inset:0,
        background:"radial-gradient(ellipse at 20% 50%,rgba(21,66,95,0.3) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(232,112,42,0.1) 0%,transparent 50%)"
      }}/>
      <div style={{ width:"100%", maxWidth:400, padding:20, position:"relative", zIndex:1 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ margin:"0 auto 16px", display:"flex", justifyContent:"center" }}>
            <Logo size={180} w={true} />
          </div>
          <p style={{ color:theme.or, fontSize:12, fontWeight:700, letterSpacing:2 }}>ABU DHABI MAINTENANCE TEAM</p>
        </div>
        <div style={{
          background:"rgba(17,31,48,0.8)", backdropFilter:"blur(20px)",
          borderRadius:18, padding:28, border:`1px solid ${theme.bl}`,
          boxShadow:"0 24px 80px rgba(0,0,0,0.5)"
        }}>
          <h2 style={{ color:theme.tx, fontSize:17, fontWeight:700, marginBottom:20, textAlign:"center" }}>Sign In to Portal</h2>
          {loginError && (
            <div style={{
              background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
              borderRadius:10, padding:"8px 12px", marginBottom:14, color:theme.rd, fontSize:12
            }}>⚠️ {loginError}</div>
          )}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", color:theme.td, fontSize:10, fontWeight:700, marginBottom:5, letterSpacing:1 }}>EMAIL ADDRESS</label>
            <input type="email" value={loginId} onChange={e => setLoginId(e.target.value)}
              placeholder="your.email@adbsafegate.ae"
              onKeyDown={e => e.key === "Enter" && login()} style={ib} />
          </div>
          <div style={{ marginBottom:22 }}>
            <label style={{ display:"block", color:theme.td, fontSize:10, fontWeight:700, marginBottom:5, letterSpacing:1 }}>PASSWORD</label>
            <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
              placeholder="Enter password"
              onKeyDown={e => e.key === "Enter" && login()} style={ib} />
          </div>
          <button onClick={login} style={{
            width:"100%", padding:"12px", borderRadius:10, border:"none",
            background:theme.ga, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer",
            boxShadow:"0 4px 20px rgba(232,112,42,0.3)"
          }}>Sign In</button>
          <div style={{ textAlign:"center", marginTop:12, fontSize:11, color:theme.td }}>
            Default password: <strong style={{ color:theme.or }}>Adb@2026</strong>
          </div>
        </div>
        <div style={{
          marginTop:18, background:"rgba(17,31,48,0.6)", borderRadius:12,
          padding:14, border:`1px solid ${theme.bd}`
        }}>
          <p style={{ color:theme.td, fontSize:10, fontWeight:700, letterSpacing:1, marginBottom:8 }}>🔑 DEMO ACCOUNTS</p>
          {dm.map(a => (
            <div key={a.id} onClick={() => { setLoginId(a.id); setLoginPassword(a.pw); }} style={{
              display:"flex", justifyContent:"space-between", padding:"7px 8px",
              borderRadius:8, cursor:"pointer", fontSize:12
            }}>
              <span style={{ color:theme.ts }}>{a.i} {a.l}</span>
              <span style={{ color:theme.or, fontFamily:"monospace", fontSize:9 }}>{a.id}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CHANGE PASSWORD
   ============================================================ */

function ChPw({ user, onCh, forced, onOut }) {
  const [o, setO] = useState("");
  const [n, setN] = useState("");
  const [c2, setC2] = useState("");
  const [er, setEr] = useState("");
  const [ok, setOk] = useState(false);

  const submit = async () => {
    setEr("");
    if (!o || !n || !c2) return setEr("Fill all fields");
    if (n.length < 6) return setEr("Min 6 characters");
    if (n === o) return setEr("Must differ from current");
    if (n !== c2) return setEr("New passwords don't match");
    if (!/[A-Z]/.test(n) || !/[0-9]/.test(n)) return setEr("Need 1 uppercase + 1 number");
    const ok2 = await onCh(o, n);
    if (!ok2) return setEr("Wrong current password");
    setOk(true);
  };

  if (ok) return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", height:"100vh", background:theme.bg
    }}>
      <div style={{ fontSize:56, marginBottom:12 }}>✅</div>
      <h2 style={{ color:theme.gn, fontSize:20 }}>Password Changed!</h2>
      <p style={{ color:theme.ts, fontSize:13, marginTop:8 }}>Redirecting...</p>
    </div>
  );

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:theme.bg }}>
      <div style={{ maxWidth:420, width:"100%", padding:20 }}>
        <div style={{ background:theme.cs, borderRadius:16, padding:28, border:`1px solid ${theme.bd}` }}>
          <h2 style={{ fontSize:20, fontWeight:700, color:theme.tx, marginBottom:6 }}>🔐 Change Password</h2>
          {forced && (
            <div style={{
              background:`${theme.or}15`, border:`1px solid ${theme.or}40`,
              borderRadius:10, padding:12, margin:"12px 0 16px", fontSize:13, color:theme.or
            }}>⚠️ Please change your initial password</div>
          )}
          <p style={{ color:theme.td, fontSize:12, marginBottom:20 }}>Min 6 chars, 1 uppercase, 1 number</p>
          {er && (
            <div style={{
              background:"rgba(239,68,68,0.1)", borderRadius:10, padding:"8px 12px",
              marginBottom:14, color:theme.rd, fontSize:12
            }}>{er}</div>
          )}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>CURRENT</label>
            <input type="password" value={o} onChange={e => setO(e.target.value)} style={ib} />
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>NEW</label>
            <input type="password" value={n} onChange={e => setN(e.target.value)} style={ib} />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>CONFIRM</label>
            <input type="password" value={c2} onChange={e => setC2(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()} style={ib} />
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Bt onClick={submit} bg={theme.or}>Update</Bt>
            <Bt onClick={onOut} outline={true}>Logout</Bt>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   NOTIFICATIONS PANEL (bell dropdown)
   ============================================================ */

function NotifPanel({ notifs, onClose, onMarkRead, onMarkAll, onGoTo }) {
  const unread = notifs.filter(n => !n.read);
  const [notifPerm, setNotifPerm] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const askPerm = async () => {
    if (!("Notification" in window)) return;
    const r = await Notification.requestPermission();
    setNotifPerm(r);
    if (r === "granted") new Notification("ADB Portal", { body: "Notifications enabled ✅", icon: "/icon-192.png" });
  };
  const iconFor = (tp) => tp === "approved" ? "✅"
    : tp === "rejected" ? "❌"
    : tp === "announcement" ? "📢"
    : "🔔";
  const go = (n) => {
    onMarkRead(n.id);
    if (n.type === "announcement") onGoTo("announcements");
    else if (n.type === "new_request") onGoTo("approvals");
    else if (n.type === "approved" || n.type === "rejected") onGoTo("leave");
  };

  return (
    <div onClick={e => e.stopPropagation()} style={{
      position:"absolute", top:32, right:0, width:340, maxHeight:420, overflowY:"auto",
      background:theme.cs, border:`1px solid ${theme.bl}`, borderRadius:12,
      boxShadow:"0 12px 40px rgba(0,0,0,0.5)", zIndex:100
    }}>
      {notifPerm === "default" && (
        <div style={{ padding:"10px 14px", background:"rgba(56,189,248,0.08)", borderBottom:`1px solid ${theme.bd}` }}>
          <div style={{ fontSize:12, color:theme.tx, marginBottom:6 }}>Get browser alerts for new items</div>
          <button onClick={askPerm} style={{
            background:theme.bu, color:"#fff", border:"none", padding:"6px 12px",
            borderRadius:8, fontSize:11, fontWeight:700, cursor:"pointer"
          }}>🔔 Enable notifications</button>
        </div>
      )}
      {notifPerm === "granted" && (
        <div style={{ padding:"6px 14px", fontSize:10, color:theme.gn, background:"rgba(16,185,129,0.08)", borderBottom:`1px solid ${theme.bd}` }}>
          ✅ Browser notifications enabled
        </div>
      )}
      {notifPerm === "denied" && (
        <div style={{ padding:"6px 14px", fontSize:10, color:theme.rd, background:"rgba(239,68,68,0.08)", borderBottom:`1px solid ${theme.bd}` }}>
          🚫 Blocked — enable via browser settings
        </div>
      )}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"12px 14px", borderBottom:`1px solid ${theme.bd}`,
        position:"sticky", top:0, background:theme.cs, zIndex:1
      }}>
        <div style={{ fontSize:13, fontWeight:700, color:theme.tx }}>
          Notifications {unread.length > 0 && <span style={{ color:theme.or }}>({unread.length})</span>}
        </div>
        {unread.length > 0 && (
          <button onClick={onMarkAll} style={{
            background:"none", border:"none", color:theme.bu, fontSize:11, cursor:"pointer", fontWeight:600
          }}>Mark all read</button>
        )}
      </div>
      {notifs.length === 0 ? (
        <div style={{ padding:"30px 16px", textAlign:"center", color:theme.td, fontSize:13 }}>
          <div style={{ fontSize:28, opacity:0.4, marginBottom:6 }}>📭</div>
          No notifications
        </div>
      ) : (
        notifs.slice(0, 20).map(n => (
          <div key={n.id} onClick={() => go(n)} style={{
            padding:"10px 14px", borderBottom:`1px solid ${theme.bd}`, cursor:"pointer",
            background: n.read ? "transparent" : "rgba(232,112,42,0.06)",
            display:"flex", gap:10
          }}>
            <div style={{ fontSize:16 }}>{iconFor(n.type)}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, color: n.read ? theme.ts : theme.tx, fontWeight: n.read ? 400 : 600 }}>{n.message}</div>
              <div style={{ fontSize:10, color:theme.td, marginTop:2 }}>{fmtDt(n.date)}</div>
            </div>
            {!n.read && <div style={{ width:6, height:6, borderRadius:"50%", background:theme.or, marginTop:6 }} />}
          </div>
        ))
      )}
    </div>
  );
}

/* ============================================================
   MANAGER DASHBOARD
   ============================================================ */

// Pastel palette for the new dashboard cards
const PASTEL = { coral:"#f5a99a", mint:"#a8e5c5", lilac:"#b9a8f2", butter:"#f5e892", sky:"#a8d4f5" };
const INK = "#0b1a2b";

// Circular progress ring — value is 0..1
const Ring = ({ value, size=120, stroke=10, color="#0b1a2b", track="rgba(0,0,0,0.12)", label, sub }) => {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div style={{ position:"relative", width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          style={{ transition:"stroke-dashoffset .6s ease" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontSize:28, fontWeight:800, color:INK, lineHeight:1 }}>{label}</div>
        {sub && <div style={{ fontSize:10, fontWeight:700, color:INK, opacity:0.7, marginTop:2, letterSpacing:0.4 }}>{sub}</div>}
      </div>
    </div>
  );
};

// Simple bar sparkline (for tiny trend charts)
const Spark = ({ values, color=INK, height=50, active=-1 }) => {
  const max = Math.max(1, ...values);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:4, height, width:"100%" }}>
      {values.map((v, i) => (
        <div key={i} style={{
          flex:1, height:`${Math.max(8, (v/max)*height)}px`,
          background: i === active ? color : `${color}55`,
          borderRadius:6,
        }} />
      ))}
    </div>
  );
};

// Small square tile in the new aesthetic
const Tile = ({ bg, label, value, sub, dark=false, children, onClick }) => {
  const fg = dark ? "#f0f4f8" : INK;
  return (
    <div onClick={onClick} style={{
      background: bg, borderRadius:22, padding:18,
      minHeight:150, cursor: onClick ? "pointer" : "default",
      display:"flex", flexDirection:"column", justifyContent:"space-between",
      color: fg, boxShadow: dark ? "none" : "0 2px 20px rgba(0,0,0,0.12)"
    }}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:1, opacity:0.75, textTransform:"uppercase" }}>{label}</div>
      {children ? children : (
        <div>
          <div style={{ fontSize:34, fontWeight:800, lineHeight:1 }}>{value}</div>
          {sub && <div style={{ fontSize:11, opacity:0.7, marginTop:4 }}>{sub}</div>}
        </div>
      )}
    </div>
  );
};

function MDash({ user, employees, leaveRequests, notifications, announcements, pc, onGoTo }) {
  const h = new Date().getHours();
  const g = h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
  const today = new Date();
  const onLeaveToday = leaveRequests.filter(r => {
    if (r.status !== "approved") return false;
    const s = new Date(r.startDate), e = new Date(r.endDate);
    return today >= s && today <= e;
  });
  const onDutyToday = employees.length - onLeaveToday.length;
  const dutyPct = employees.length ? onDutyToday / employees.length : 1;
  const expiringCerts = employees.reduce((a, e) => a + (e.training || []).filter(x => {
    const d = (new Date(x.certExpiry) - new Date()) / 864e5;
    return d >= 0 && d <= 90;
  }).length, 0);
  const expiringDocs = employees.reduce((a, e) => a + (e.documents || []).filter(x => {
    const d = (new Date(x.expiryDate) - new Date()) / 864e5;
    return d >= 0 && d <= 90;
  }).length, 0);
  const pinnedAnn = announcements.filter(a => a.pinned).slice(0, 1);
  const sectionCounts = SECTIONS.map(s => ({
    name: s, count: employees.filter(e => e.section === s).length
  }));
  const maxSectionCount = Math.max(1, ...sectionCounts.map(s => s.count));
  const dateStr = today.toLocaleDateString("en-GB", { weekday:"short", day:"2-digit", month:"short" }).toUpperCase();

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:theme.ts, letterSpacing:1, textTransform:"uppercase", fontWeight:700 }}>{g}</div>
          <h2 style={{ fontSize:26, fontWeight:800, color:theme.tx, margin:0, letterSpacing:-0.3 }}>{user.name.toUpperCase()}</h2>
        </div>
        <div style={{ width:48, height:48, borderRadius:"50%", background:theme.ga,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:800, color:"#fff" }}>
          {user.name.split(" ").map(n => n[0]).join("").slice(0,2)}
        </div>
      </div>
      <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 12px",
        background:theme.ch, borderRadius:20, marginBottom:18, fontSize:11, fontWeight:700, letterSpacing:0.5, color:theme.ts }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:"#10b981" }} />
        {dateStr} · {pc} PENDING
      </div>

      {/* Pinned banner */}
      {pinnedAnn.length > 0 && pinnedAnn.map(a => {
        const pr = ANN_PRIORITIES.find(p => p.key === a.priority);
        return (
          <div key={a.id} onClick={() => onGoTo("announcements")} style={{
            background:`linear-gradient(135deg, ${pr.color}22, ${pr.color}08)`,
            border:`1px solid ${pr.color}40`, borderRadius:18,
            padding:"14px 16px", marginBottom:16, cursor:"pointer"
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:4 }}>
              <div style={{ fontSize:13, fontWeight:800, color:theme.tx }}>📌 {a.title}</div>
              <Bd text={pr.label.toUpperCase()} color={pr.color} />
            </div>
            <div style={{ fontSize:12, color:theme.ts }}>
              {a.message.length > 120 ? a.message.slice(0, 120) + "…" : a.message}
            </div>
          </div>
        );
      })}

      {/* Hero: Team on duty ring */}
      <div style={{ background:PASTEL.coral, borderRadius:24, padding:20, marginBottom:14,
        display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:160 }}>
          <div style={{ fontSize:11, fontWeight:700, color:INK, opacity:0.75, letterSpacing:1 }}>TEAM TODAY</div>
          <div style={{ fontSize:30, fontWeight:900, color:INK, letterSpacing:-0.5, margin:"4px 0 10px" }}>ON DUTY</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:12, color:INK }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:"50%", background:INK }} />Active</span>
              <b>{onDutyToday}/{employees.length}</b>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:"50%", background:"#fff" }} />On Leave</span>
              <b>{onLeaveToday.length}</b>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:"50%", background:"rgba(0,0,0,0.35)" }} />Pending</span>
              <b>{pc}</b>
            </div>
          </div>
        </div>
        <Ring value={dutyPct} size={130} stroke={12} color={INK} track="rgba(255,255,255,0.5)"
          label={Math.round(dutyPct*100) + "%"} sub="ON DUTY" />
      </div>

      {/* Two small cards row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        <Tile bg={PASTEL.lilac} label="Approvals" value={pc} sub="awaiting your review" onClick={() => onGoTo("approvals")} />
        <Tile bg={PASTEL.butter} label="Expiring" value={expiringCerts + expiringDocs} sub="certs + documents ≤90d" onClick={() => onGoTo("documents")} />
      </div>

      {/* Section breakdown as dark card with horizontal bars */}
      <Tile bg={theme.cs} dark label="Section Breakdown">
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:8 }}>
          {sectionCounts.map((s, i) => (
            <div key={s.name} style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:100, fontSize:12, color:theme.tx, fontWeight:600 }}>{s.name}</div>
              <div style={{ flex:1, height:8, background:"rgba(255,255,255,0.08)", borderRadius:99, overflow:"hidden" }}>
                <div style={{ width:`${(s.count/maxSectionCount)*100}%`, height:"100%",
                  background: [PASTEL.coral, PASTEL.lilac, PASTEL.mint, PASTEL.butter, PASTEL.sky][i % 5],
                  borderRadius:99 }} />
              </div>
              <div style={{ width:24, fontSize:13, fontWeight:800, color:theme.tx, textAlign:"right" }}>{s.count}</div>
            </div>
          ))}
        </div>
      </Tile>

      <div style={{ height:14 }} />

      {/* Recent activity + on leave today */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:14 }}>
        <Sec title="Recent Leave" icon="📋" action={<Bt onClick={() => onGoTo("leave")} small={true} outline={true}>View all</Bt>}>
          {leaveRequests.slice(0, 4).map(r => (
            <div key={r.id} style={{
              display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"10px 0", borderBottom:`1px solid ${theme.bd}`, flexWrap:"wrap", gap:4
            }}>
              <div>
                <div style={{ fontSize:13, color:theme.tx, fontWeight:600 }}>{r.empName}</div>
                <div style={{ fontSize:11, color:theme.td }}>{r.type} • {r.days}d</div>
              </div>
              <Bd text={STATUS_LABELS[r.status]} color={STATUS_COLORS[r.status]} />
            </div>
          ))}
        </Sec>

        <Sec title="On Leave Today" icon="🏖️" action={<Bt onClick={() => onGoTo("calendar")} small={true} outline={true}>Calendar</Bt>}>
          {onLeaveToday.length === 0
            ? <Empty icon="📅" text="Everyone is on duty" />
            : onLeaveToday.map(r => (
              <div key={r.id} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"10px 0", borderBottom:`1px solid ${theme.bd}`, flexWrap:"wrap", gap:4
              }}>
                <div>
                  <div style={{ fontSize:13, color:theme.tx, fontWeight:600 }}>{r.empName}</div>
                  <div style={{ fontSize:11, color:theme.td }}>{r.type} • until {r.endDate}</div>
                </div>
                <Bd text={r.section} color={theme.bu} />
              </div>
            ))}
        </Sec>
      </div>
    </div>
  );
}

/* ============================================================
   EMPLOYEE DASHBOARD
   ============================================================ */

function EDash({ user, notifications, announcements, onGoTo }) {
  const h = new Date().getHours();
  const g = h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
  const myAnn = announcements.filter(a => a.target === "all" || a.target === user.section);
  const pinnedAnn = myAnn.filter(a => a.pinned).slice(0, 1);
  const latestAnn = myAnn.filter(a => !a.pinned).slice(0, 3);

  const docsExpiring = (user.documents || []).filter(d => {
    const diff = (new Date(d.expiryDate) - new Date()) / 864e5;
    return diff >= 0 && diff <= 90;
  });
  const certsExpiring = (user.training || []).filter(x => {
    const diff = (new Date(x.certExpiry) - new Date()) / 864e5;
    return diff >= 0 && diff <= 90;
  });

  // Today roster code for the status pill
  const today = new Date();
  const mk = `2026-${String(today.getMonth()+1).padStart(2,"0")}`;
  const dayIdx = today.getDate() - 1;
  const todayCode = user.roster?.[mk]?.[dayIdx]?.code;
  const dutyLabel = todayCode === "O" ? "OFF DUTY"
    : todayCode === "L" ? "ON LEAVE"
    : todayCode === "M" ? "MORNING SHIFT"
    : todayCode === "N" ? "NIGHT SHIFT" : "ON DUTY";
  const dutyColor = todayCode === "O" || todayCode === "L" ? "#94a3b8" : "#10b981";

  // Leave ring: annual used vs allowed
  const annualUsedPct = user.annualLeave ? user.usedAnnual / user.annualLeave : 0;
  const annualLeft = user.annualLeave - user.usedAnnual;

  // Sparkline of leave usage (mock monthly distribution from roster)
  const monthlyLeaves = [0,1,2,3].map(m => {
    const r = user.roster?.[`2026-${String(m+1).padStart(2,"0")}`] || [];
    return r.filter(d => d.code === "L").length;
  });
  const currentMonthIdx = today.getMonth();

  const dateStr = today.toLocaleDateString("en-GB", { weekday:"short", day:"2-digit", month:"short" }).toUpperCase();

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:theme.ts, letterSpacing:1, textTransform:"uppercase", fontWeight:700 }}>{g}</div>
          <h2 style={{ fontSize:26, fontWeight:800, color:theme.tx, margin:0, letterSpacing:-0.3 }}>
            {user.name.split(" ")[0].toUpperCase()}
          </h2>
        </div>
        <div style={{ width:48, height:48, borderRadius:"50%", background:theme.gp,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:800, color:"#fff" }}>
          {user.name.split(" ").map(n => n[0]).join("").slice(0,2)}
        </div>
      </div>
      <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 12px",
        background:theme.ch, borderRadius:20, marginBottom:18, fontSize:11, fontWeight:700, letterSpacing:0.5, color:theme.ts }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:dutyColor }} />
        {dateStr} · {dutyLabel}
      </div>

      {/* Pinned announcement (if any) */}
      {pinnedAnn.map(a => {
        const pr = ANN_PRIORITIES.find(p => p.key === a.priority);
        return (
          <div key={a.id} onClick={() => onGoTo("announcements")} style={{
            background:`linear-gradient(135deg, ${pr.color}22, ${pr.color}08)`,
            border:`1px solid ${pr.color}40`, borderRadius:18,
            padding:"14px 16px", marginBottom:16, cursor:"pointer"
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:4 }}>
              <div style={{ fontSize:13, fontWeight:800, color:theme.tx }}>📌 {a.title}</div>
              <Bd text={pr.label.toUpperCase()} color={pr.color} />
            </div>
            <div style={{ fontSize:12, color:theme.ts }}>
              {a.message.length > 120 ? a.message.slice(0, 120) + "…" : a.message}
            </div>
          </div>
        );
      })}

      {/* Hero: Annual Leave ring */}
      <div style={{ background:PASTEL.coral, borderRadius:24, padding:20, marginBottom:14,
        display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:160 }}>
          <div style={{ fontSize:11, fontWeight:700, color:INK, opacity:0.75, letterSpacing:1 }}>THIS YEAR</div>
          <div style={{ fontSize:30, fontWeight:900, color:INK, letterSpacing:-0.5, margin:"4px 0 10px" }}>LEAVE BALANCE</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:12, color:INK }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:"50%", background:INK }} />Annual used</span>
              <b>{user.usedAnnual}/{user.annualLeave}</b>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:"50%", background:"#fff" }} />Sick left</span>
              <b>{user.sickLeave - user.usedSick}/{user.sickLeave}</b>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:"50%", background:"rgba(0,0,0,0.35)" }} />Comp-off</span>
              <b>{user.compOff}</b>
            </div>
          </div>
        </div>
        <Ring value={annualUsedPct} size={130} stroke={12} color={INK} track="rgba(255,255,255,0.5)"
          label={annualLeft} sub="DAYS LEFT" />
      </div>

      {/* Monthly leave trend + certs status */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        <Tile bg={PASTEL.lilac} label="Leave Usage">
          <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
            <Spark values={monthlyLeaves} color={INK} active={currentMonthIdx} />
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:10, fontWeight:700, opacity:0.7 }}>
              {["JAN","FEB","MAR","APR"].map(m => <span key={m}>{m}</span>)}
            </div>
          </div>
        </Tile>
        <Tile bg={PASTEL.butter} label="Certificates"
          value={(user.training?.length || 0) - certsExpiring.length}
          sub={`${certsExpiring.length} expiring · ${user.training?.length || 0} total`}
          onClick={() => onGoTo("training")} />
      </div>

      {/* Action Required card (if anything expiring) */}
      {(certsExpiring.length > 0 || docsExpiring.length > 0) && (
        <Tile bg={theme.cs} dark label="⚠ Action Required">
          <div style={{ marginTop:8 }}>
            {certsExpiring.slice(0,3).map(x => (
              <div key={"c"+x.id} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"10px 0", borderBottom:`1px solid ${theme.bd}`, gap:6, flexWrap:"wrap"
              }}>
                <div>
                  <div style={{ fontSize:13, color:theme.tx, fontWeight:600 }}>{x.title}</div>
                  <div style={{ fontSize:11, color:theme.td }}>Expires {x.certExpiry}</div>
                </div>
                <Bd text="EXPIRING" color={theme.yl} />
              </div>
            ))}
            {docsExpiring.slice(0,3).map(x => (
              <div key={"d"+x.id} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"10px 0", borderBottom:`1px solid ${theme.bd}`, gap:6, flexWrap:"wrap"
              }}>
                <div>
                  <div style={{ fontSize:13, color:theme.tx, fontWeight:600 }}>{x.title}</div>
                  <div style={{ fontSize:11, color:theme.td }}>Document expires {x.expiryDate}</div>
                </div>
                <Bd text="EXPIRING" color={theme.yl} />
              </div>
            ))}
          </div>
        </Tile>
      )}

      <div style={{ height:14 }} />

      {/* Latest announcements list */}
      {latestAnn.length > 0 && (
        <Sec title="Announcements" icon="📢" action={<Bt onClick={() => onGoTo("announcements")} small={true} outline={true}>View all</Bt>}>
          {latestAnn.map(a => {
            const pr = ANN_PRIORITIES.find(p => p.key === a.priority);
            return (
              <div key={a.id} style={{ padding:"10px 0", borderBottom:`1px solid ${theme.bd}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:theme.tx }}>{a.title}</div>
                  <Bd text={pr.label.toUpperCase()} color={pr.color} />
                </div>
                <div style={{ fontSize:11, color:theme.td, marginTop:4 }}>{fmtDt(a.date)} • {a.by}</div>
              </div>
            );
          })}
        </Sec>
      )}

      {user.achievements?.length > 0 && (
        <Sec title="My Achievements" icon="🏆">
          {user.achievements.map(a => (
            <div key={a.id} style={{
              background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.2)",
              borderRadius:10, padding:14, marginBottom:8
            }}>
              <div style={{ fontSize:13, fontWeight:600, color:theme.gn }}>{a.title}</div>
              <div style={{ fontSize:11, color:theme.ts, marginTop:4 }}>{a.desc}</div>
            </div>
          ))}
        </Sec>
      )}
    </div>
  );
}

/* ============================================================
   PROFILE
   ============================================================ */

function Prof({ emp, canEdit, onSave, onAdd, isStaff, isMgr }) {
  const [ed, setEd] = useState(false);
  const [fm, setFm] = useState({ ...emp });
  const up = k => v => setFm(p => ({ ...p, [k]:v }));
  const [saf, setSaf] = useState(false);
  const [af, setAf] = useState({ type:"achievement", title:"", desc:"" });
  const finalized = !!emp.profileFinalized;

  useEffect(() => { setFm({ ...emp }); }, [emp.id]);

  return (
    <div>
      {finalized && (
        <div style={{ background:"rgba(16,185,129,0.1)", border:"1px solid rgba(16,185,129,0.3)",
          borderRadius:12, padding:"10px 14px", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:16 }}>🔒</span>
          <span style={{ color:theme.gn, fontSize:13, fontWeight:600 }}>
            Profile finalized — only Team Lead or Manager can make further edits
          </span>
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, margin:0 }}>{emp.name}</h2>
          <p style={{ color:theme.ts, fontSize:13, margin:"4px 0 0" }}>{emp.designation} • {emp.section}</p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {canEdit && !ed && <Bt onClick={() => setEd(true)}>✏️ Edit</Bt>}
          {canEdit && <Bt onClick={() => setSaf(!saf)} bg={theme.or} small={true}>{saf ? "Cancel" : "📋 Add Record"}</Bt>}
          {isStaff && !ed && (finalized
            ? <Bt onClick={() => onSave({ ...emp, profileFinalized:false })} bg={theme.yl} small={true}>🔓 Unlock</Bt>
            : <Bt onClick={() => onSave({ ...emp, profileFinalized:true })} bg={theme.gn} small={true}>🔒 Finalize</Bt>)}
          {ed && <>
            <Bt onClick={() => { onSave(fm); setEd(false); }} bg={theme.gn}>💾 Save</Bt>
            <Bt onClick={() => { setFm({ ...emp }); setEd(false); }} outline={true}>Cancel</Bt>
          </>}
        </div>
      </div>

      {saf && (
        <div style={{ background:theme.cs, borderRadius:14, padding:20, border:`1px solid ${theme.or}40`, marginBottom:18 }}>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            {["achievement","warning","action"].map(tp => (
              <div key={tp} onClick={() => setAf(p => ({ ...p, type:tp }))} style={{
                padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:600,
                background: af.type === tp ? (tp === "warning" ? theme.rd : tp === "achievement" ? theme.gn : theme.bu) : theme.card,
                color: af.type === tp ? "#fff" : theme.ts, textTransform:"capitalize"
              }}>{tp}</div>
            ))}
          </div>
          <input placeholder="Title..." value={af.title} onChange={e => setAf(p => ({ ...p, title:e.target.value }))}
            style={{ ...ib, marginBottom:10 }} />
          <textarea placeholder="Description..." value={af.desc} onChange={e => setAf(p => ({ ...p, desc:e.target.value }))}
            rows={2} style={{ ...ib, resize:"vertical", fontFamily:"inherit", marginBottom:12 }} />
          <Bt onClick={() => {
            if (af.title.trim()) {
              onAdd(emp.id, af);
              setAf({ type:"achievement", title:"", desc:"" });
              setSaf(false);
            }
          }} bg={theme.or}>Submit</Bt>
        </div>
      )}

      <div style={{
        background:theme.gp, borderRadius:16, padding:24, marginBottom:18,
        display:"flex", alignItems:"center", gap:18, flexWrap:"wrap"
      }}>
        <div style={{
          width:64, height:64, borderRadius:16, background:"rgba(255,255,255,0.12)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:22, fontWeight:800, color:"#fff"
        }}>{emp.name.split(" ").map(n => n[0]).join("").slice(0,2)}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:20, fontWeight:700, color:"#fff" }}>{emp.name}</div>
          <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
            <Bd text={emp.section} color={theme.cy} />
            <Bd text={emp.empNo} color={theme.gn} />
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:16 }}>
        <Sec title="Personal" icon="👤">
          <Fd label="Name" value={fm.name} editing={ed} onChange={up("name")} />
          <Fd label="Nationality" value={fm.nationality} editing={ed} onChange={up("nationality")} />
          <Fd label="Mobile" value={fm.mobile} editing={ed} onChange={up("mobile")} />
        </Sec>
        <Sec title="Employment" icon="🏢">
          <Fd label="Employee No" value={fm.empNo} editing={ed} onChange={up("empNo")} />
          <Fd label="Designation" value={fm.designation} editing={ed} onChange={up("designation")} />
          <Fd label="Section" value={fm.section} editing={ed} onChange={up("section")} />
        </Sec>
      </div>

      {isStaff && (
        <Sec title="Capability Tier" icon="🎯">
          {isMgr && ed ? (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {["", ...TIERS_CAP].map(t => (
                <button key={t || "none"} onClick={() => up("tier")(t)} style={{
                  padding:"8px 16px", borderRadius:10, fontWeight:700, cursor:"pointer", fontSize:13,
                  background: (fm.tier || "") === t ? (TIER_CAP_COLORS[t] || theme.ch) : theme.ch,
                  color: (fm.tier || "") === t && t ? "#fff" : theme.tx,
                  border: `1px solid ${(fm.tier || "") === t ? (TIER_CAP_COLORS[t] || theme.bd) : theme.bd}`
                }}>{t || "—"}</button>
              ))}
            </div>
          ) : (
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {emp.tier
                ? <Bd text={emp.tier} color={TIER_CAP_COLORS[emp.tier] || theme.bu} />
                : <span style={{ color:theme.td, fontSize:12 }}>Not assigned</span>}
              {!isMgr && (
                <span style={{ color:theme.td, fontSize:11 }}>(Manager-only edit)</span>
              )}
            </div>
          )}
        </Sec>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:16 }}>
        <Sec title="Achievements" icon="🏆">
          {(!emp.achievements || !emp.achievements.length)
            ? <Empty text="No records" />
            : emp.achievements.map(a => (
              <div key={a.id} style={{
                background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.2)",
                borderRadius:10, padding:14, marginBottom:8
              }}>
                <div style={{ fontSize:13, fontWeight:600, color:theme.gn }}>{a.title}</div>
                <div style={{ fontSize:11, color:theme.ts, marginTop:4 }}>{a.desc}</div>
                <div style={{ fontSize:10, color:theme.td, marginTop:4 }}>{a.by} • {a.date}</div>
              </div>
            ))}
        </Sec>
        <Sec title="Warnings & Actions" icon="⚠️">
          {((!emp.warnings || !emp.warnings.length) && (!emp.actions || !emp.actions.length))
            ? <Empty text="No records" />
            : <>
              {(emp.warnings || []).map(w => (
                <div key={w.id} style={{
                  background:"rgba(239,68,68,0.08)", borderRadius:10, padding:14, marginBottom:8
                }}>
                  <div style={{ fontSize:13, fontWeight:600, color:theme.rd }}>{w.title}</div>
                  <div style={{ fontSize:11, color:theme.ts, marginTop:4 }}>{w.desc}</div>
                </div>
              ))}
              {(emp.actions || []).map(a => (
                <div key={a.id} style={{
                  background:"rgba(56,189,248,0.08)", borderRadius:10, padding:14, marginBottom:8
                }}>
                  <div style={{ fontSize:13, fontWeight:600, color:theme.bu }}>{a.title}</div>
                  <div style={{ fontSize:11, color:theme.ts, marginTop:4 }}>{a.desc}</div>
                </div>
              ))}
            </>}
        </Sec>
      </div>

      <Sec title="Training & Certifications" icon="🎓">
        {(!emp.training || !emp.training.length)
          ? <Empty text="No records" />
          : emp.training.map(tr => {
            const st = certSt(tr.certExpiry);
            return (
              <div key={tr.id} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"10px 0", borderBottom:`1px solid ${theme.bd}`, flexWrap:"wrap", gap:6
              }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:theme.tx }}>{tr.title}</div>
                  <div style={{ fontSize:11, color:theme.ts }}>
                    {tr.provider} • Expires: <span style={{ color:st.c, fontWeight:600 }}>{tr.certExpiry}</span>
                  </div>
                </div>
                <Bd text={st.l} color={st.c} />
              </div>
            );
          })}
      </Sec>
    </div>
  );
}

/* ============================================================
   TEAM LIST
   ============================================================ */

function InviteForm({ employees, onInvite, onClose }) {
  const [fm, setFm] = useState({
    email: "", name: "", section: SECTIONS[0] || "",
    designation: "", role: "employee", tier: ""
  });
  const [err, setErr] = useState("");
  const up = k => v => setFm(p => ({ ...p, [k]: v }));
  const submit = () => {
    setErr("");
    const res = onInvite(fm);
    if (!res.ok) { setErr(res.error || "Failed to invite"); return; }
    onClose(res.id);
  };
  return (
    <Modal title="Invite Employee" onClose={() => onClose(null)} width={520}>
      <p style={{ color:theme.ts, fontSize:12, margin:"0 0 14px" }}>
        Creates a placeholder record. The employee then signs up at the login
        page using this email and sets their own password — they'll land on the
        profile page to fill in personal details.
      </p>
      <div style={{ display:"grid", gap:10 }}>
        <label style={{ color:theme.tx, fontSize:12, fontWeight:600 }}>
          Email <span style={{ color:theme.rd }}>*</span>
          <input value={fm.email} onChange={e => up("email")(e.target.value)}
            placeholder="someone@adbsafegate.ae or @gmail / @outlook"
            style={{ ...ib, marginTop:4 }} />
        </label>
        <label style={{ color:theme.tx, fontSize:12, fontWeight:600 }}>
          Full name <span style={{ color:theme.rd }}>*</span>
          <input value={fm.name} onChange={e => up("name")(e.target.value)}
            style={{ ...ib, marginTop:4 }} />
        </label>
        <label style={{ color:theme.tx, fontSize:12, fontWeight:600 }}>
          Section
          <select value={fm.section} onChange={e => up("section")(e.target.value)}
            style={{ ...ib, marginTop:4 }}>
            {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ color:theme.tx, fontSize:12, fontWeight:600 }}>
          Designation
          <input value={fm.designation} onChange={e => up("designation")(e.target.value)}
            style={{ ...ib, marginTop:4 }} />
        </label>
        <label style={{ color:theme.tx, fontSize:12, fontWeight:600 }}>
          Role
          <select value={fm.role} onChange={e => up("role")(e.target.value)}
            style={{ ...ib, marginTop:4 }}>
            <option value="employee">Employee</option>
            <option value="teamlead">Team Lead</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        <div>
          <div style={{ color:theme.tx, fontSize:12, fontWeight:600, marginBottom:6 }}>
            Capability Tier
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {["", ...TIERS_CAP].map(t => (
              <button key={t || "none"} onClick={() => up("tier")(t)} style={{
                padding:"8px 14px", borderRadius:8, fontWeight:700, cursor:"pointer", fontSize:12,
                background: fm.tier === t ? (TIER_CAP_COLORS[t] || theme.ch) : theme.ch,
                color: fm.tier === t && t ? "#fff" : theme.tx,
                border: `1px solid ${fm.tier === t ? (TIER_CAP_COLORS[t] || theme.bd) : theme.bd}`
              }}>{t || "—"}</button>
            ))}
          </div>
        </div>
      </div>
      {err && <div style={{ color:theme.rd, fontSize:12, marginTop:12 }}>{err}</div>}
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
        <Bt onClick={() => onClose(null)} outline={true}>Cancel</Bt>
        <Bt onClick={submit} bg={theme.gn}>Send invite</Bt>
      </div>
    </Modal>
  );
}

function BulkInviteForm({ onBulkInvite, onClose }) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState(null);  // { columns, rows } | null
  const [result,  setResult]  = useState(null);  // outcome from onBulkInvite | null

  const sample = "email,name,section,designation,role,tier\n" +
                 "john.doe@adbsafegate.com,John Doe,AGL 12hrs,Technician,employee,T2\n" +
                 "jane.smith@gmail.com,Jane Smith,Helpdesk,Specialist,employee,T1";

  const parsePreview = () => {
    const parsed = parseCSV(csv);
    if (!parsed.rows.length) {
      setPreview({ columns: parsed.columns, rows: [], err: "No data rows. Paste at least one row." });
      return;
    }
    // Map each row to an object using the column order
    const rowsObj = parsed.rows.map(cols => {
      const o = {};
      parsed.columns.forEach((c, i) => o[c] = cols[i] || "");
      return o;
    });
    setPreview({ columns: parsed.columns, rows: rowsObj });
    setResult(null);
  };

  const importNow = () => {
    if (!preview?.rows?.length) return;
    const r = onBulkInvite(preview.rows);
    setResult(r);
  };

  const headers = ["email","name","section","designation","role","tier"];

  return (
    <Modal title="Bulk Import Employees (CSV)" onClose={() => onClose(result)} width={760}>
      {!result && (
        <>
          <p style={{ color:theme.ts, fontSize:12, margin:"0 0 10px" }}>
            Paste a CSV (or copy a range from Excel — tab-separated also works).
            First row may be a header. Recognized columns: {headers.join(", ")}.
            Tier values: T1, T2, T3, T4 or blank.
          </p>
          <details style={{ color:theme.td, fontSize:11, marginBottom:10 }}>
            <summary style={{ cursor:"pointer" }}>Sample format</summary>
            <pre style={{ background:theme.ch, padding:10, borderRadius:6, marginTop:6, fontSize:11, overflow:"auto" }}>
{sample}
            </pre>
          </details>
          <textarea
            value={csv}
            onChange={e => setCsv(e.target.value)}
            placeholder="Paste rows here…"
            rows={8}
            style={{ ...ib, fontFamily:"monospace", fontSize:12, resize:"vertical" }}
          />
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 }}>
            <Bt onClick={() => onClose(null)} outline={true}>Cancel</Bt>
            <Bt onClick={parsePreview} bg={theme.bu} disabled={!csv.trim()}>Parse preview</Bt>
          </div>

          {preview && preview.err && (
            <div style={{ color:theme.rd, fontSize:12, marginTop:12 }}>{preview.err}</div>
          )}

          {preview && preview.rows?.length > 0 && (
            <div style={{ marginTop:14 }}>
              <div style={{ color:theme.tx, fontSize:13, fontWeight:700, marginBottom:6 }}>
                Preview ({preview.rows.length} rows)
              </div>
              <div style={{ maxHeight:240, overflowY:"auto", border:`1px solid ${theme.bd}`, borderRadius:8 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead>
                    <tr style={{ background:theme.ch, position:"sticky", top:0 }}>
                      {headers.map(h => (
                        <th key={h} style={{ padding:"6px 8px", textAlign:"left", color:theme.td, fontWeight:700, fontSize:10, textTransform:"uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} style={{ borderTop:`1px solid ${theme.bd}` }}>
                        {headers.map(h => (
                          <td key={h} style={{ padding:"4px 8px", color:theme.tx, whiteSpace:"nowrap" }}>{r[h] || ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 }}>
                <Bt onClick={() => { setPreview(null); setCsv(""); }} outline={true}>Clear</Bt>
                <Bt onClick={importNow} bg={theme.gn}>Import {preview.rows.length} rows</Bt>
              </div>
            </div>
          )}
        </>
      )}

      {result && (
        <>
          <div style={{
            background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.3)",
            borderRadius:10, padding:14, marginBottom:14
          }}>
            <div style={{ color:theme.gn, fontSize:14, fontWeight:700 }}>
              Done — {result.created} created, {result.skipped} skipped, {result.errors} errors
            </div>
          </div>
          {result.outcomes.length > 0 && (
            <div style={{ maxHeight:300, overflowY:"auto", border:`1px solid ${theme.bd}`, borderRadius:8 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead>
                  <tr style={{ background:theme.ch, position:"sticky", top:0 }}>
                    {["#","email","status","details"].map(h => (
                      <th key={h} style={{ padding:"6px 8px", textAlign:"left", color:theme.td, fontWeight:700, fontSize:10, textTransform:"uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.outcomes.map((o, i) => (
                    <tr key={i} style={{ borderTop:`1px solid ${theme.bd}` }}>
                      <td style={{ padding:"4px 8px", color:theme.td }}>{o.line}</td>
                      <td style={{ padding:"4px 8px", color:theme.tx }}>{o.email}</td>
                      <td style={{ padding:"4px 8px" }}>
                        <Bd
                          text={o.status}
                          color={o.status === "created" ? theme.gn : o.status === "skipped" ? theme.yl : theme.rd}
                        />
                      </td>
                      <td style={{ padding:"4px 8px", color:theme.ts }}>{o.id || o.reason || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 }}>
            <Bt onClick={() => onClose(result)} bg={theme.gn}>Close</Bt>
          </div>
        </>
      )}
    </Modal>
  );
}

function Team({ employees, onSel, isMgr, isTL, onInvite, onBulkInvite }) {
  const [f, setF] = useState("All");
  const [tierF, setTierF] = useState("all");
  const [s, setS] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const showRating = isMgr || isTL;

  const fl = employees
    .filter(e => f === "All" || e.section === f)
    .filter(e => !e.name.toLowerCase().includes(s.toLowerCase()) ? false : true)
    .filter(e => {
      if (!showRating || tierF === "all") return true;
      if (tierF === "unrated") return !gradeFromRating(e.rating);
      if (tierF.startsWith("grade:")) return gradeFromRating(e.rating)?.label === tierF.slice(6);
      if (tierF.startsWith("cap:")) return e.tier === tierF.slice(4);
      return e.rating?.tier === tierF;
    });

  const headers = showRating
    ? (isMgr
        ? ["Name","Section","Designation","Grade","Tier","Salary",""]
        : ["Name","Section","Designation","Grade","Tier",""])
    : ["Name","Section","Designation",""];

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, margin:0 }}>All Employees ({employees.length})</h2>
        {isMgr && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {onBulkInvite && (
              <Bt onClick={() => setShowBulk(true)} bg={theme.bu}>📋 Bulk Import (CSV)</Bt>
            )}
            {onInvite && (
              <Bt onClick={() => setShowInvite(true)} bg={theme.gn}>+ Invite Employee</Bt>
            )}
          </div>
        )}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {["All", ...SECTIONS].map(sec => (
          <div key={sec} onClick={() => setF(sec)} style={{
            padding:"7px 16px", borderRadius:10, cursor:"pointer",
            fontSize:12, fontWeight:600,
            background: f === sec ? theme.pl : theme.card,
            color: f === sec ? "#fff" : theme.ts
          }}>{sec} ({sec === "All" ? employees.length : employees.filter(e => e.section === sec).length})</div>
        ))}
      </div>
      {showRating && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
          {[{k:"all",l:"All"},{k:"grade:A+",l:"A+"},{k:"grade:A",l:"A"},{k:"grade:B+",l:"B+"},{k:"grade:B",l:"B"},{k:"grade:C",l:"C"},
            ...TIERS_CAP.map(t => ({ k:`cap:${t}`, l:t })),
            ...(isMgr ? [{k:"A",l:"Salary A"},{k:"B",l:"Salary B"},{k:"C",l:"Salary C"}] : []),
            {k:"unrated",l:"Unrated"}].map(x => (
            <div key={x.k} onClick={() => setTierF(x.k)} style={{
              padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:11, fontWeight:600,
              background: tierF === x.k ? theme.or : theme.card,
              color: tierF === x.k ? "#fff" : theme.ts
            }}>{x.l}</div>
          ))}
        </div>
      )}
      <input placeholder="🔍 Search..." value={s} onChange={e => setS(e.target.value)}
        style={{ ...ib, marginBottom:14 }} />
      <div style={{ background:theme.card, borderRadius:14, border:`1px solid ${theme.bd}`, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:"rgba(255,255,255,0.03)" }}>
                {headers.map(h => (
                  <th key={h} style={{
                    padding:"12px", textAlign:"left", color:theme.td,
                    fontWeight:700, fontSize:10, textTransform:"uppercase"
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fl.map(e => {
                const grade = gradeFromRating(e.rating);
                return (
                  <tr key={e.id} style={{ borderTop:`1px solid ${theme.bd}` }}>
                    <td style={{ padding:"10px 12px", color:theme.tx, fontWeight:500 }}>{e.name}</td>
                    <td style={{ padding:"10px 12px" }}><Bd text={e.section} color={theme.bu} /></td>
                    <td style={{ padding:"10px 12px", color:theme.ts }}>{e.designation}</td>
                    {showRating && (
                      <td style={{ padding:"10px 12px" }}>
                        {grade ? <Bd text={grade.label} color={grade.color} /> : <span style={{ color:theme.td, fontSize:11 }}>—</span>}
                      </td>
                    )}
                    {showRating && (
                      <td style={{ padding:"10px 12px" }}>
                        {e.tier
                          ? <Bd text={e.tier} color={TIER_CAP_COLORS[e.tier] || theme.bu} />
                          : <span style={{ color:theme.td, fontSize:11 }}>—</span>}
                      </td>
                    )}
                    {isMgr && (
                      <td style={{ padding:"10px 12px" }}>
                        {e.rating?.tier ? <Bd text={e.rating.tier} color={TIER_COLORS[e.rating.tier]} /> : <span style={{ color:theme.td, fontSize:11 }}>—</span>}
                      </td>
                    )}
                    <td style={{ padding:"10px 12px" }}><Bt onClick={() => onSel(e)} small={true}>View</Bt></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {showInvite && isMgr && onInvite && (
        <InviteForm employees={employees} onInvite={onInvite}
          onClose={() => setShowInvite(false)} />
      )}
      {showBulk && isMgr && onBulkInvite && (
        <BulkInviteForm onBulkInvite={onBulkInvite}
          onClose={() => setShowBulk(false)} />
      )}
    </div>
  );
}

/* ============================================================
   PERFORMANCE / RATINGS (TL + Manager)
   ============================================================ */

function StarRow({ value, onChange, editable }) {
  return (
    <div style={{ display:"flex", gap:4 }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => editable && onChange(n)} disabled={!editable} style={{
          width:28, height:28, background:"none", border:"none", padding:0,
          cursor: editable ? "pointer" : "default", fontSize:22, lineHeight:1,
          color: n <= (value||0) ? "#f5a623" : "rgba(255,255,255,0.2)"
        }}>★</button>
      ))}
    </div>
  );
}

function PerfEditor({ emp, isMgr, onSave, onClose }) {
  const [r, setR] = useState({
    knowledge: 0, experience: 0, loyalty: 0, capability: 0, tier:"", notes:"",
    ...(emp.rating || {})
  });
  const grade = gradeFromRating(r);
  const save = () => { onSave(emp.id, r); onClose(); };
  return (
    <Modal title={`Performance: ${emp.name}`} onClose={onClose} width={560}>
      <div style={{ padding:"4px 2px 8px", color:theme.ts, fontSize:12 }}>
        {emp.designation} · {emp.section}
      </div>
      {RATING_KEYS.map(({ k, label, icon }) => (
        <div key={k} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"12px 0", borderBottom:`1px solid ${theme.bd}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:18 }}>{icon}</span>
            <span style={{ color:theme.tx, fontSize:14, fontWeight:600 }}>{label}</span>
          </div>
          <StarRow value={r[k]} onChange={v => setR(p => ({ ...p, [k]:v }))} editable={true} />
        </div>
      ))}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"14px 0", borderBottom:`1px solid ${theme.bd}` }}>
        <span style={{ color:theme.tx, fontSize:14, fontWeight:700 }}>Auto Grade</span>
        <span style={{ fontSize:20, fontWeight:900, color: grade?.color || theme.td }}>
          {grade?.label || "—"}
        </span>
      </div>
      {isMgr && (
        <div style={{ padding:"14px 0", borderBottom:`1px solid ${theme.bd}` }}>
          <div style={{ color:theme.tx, fontSize:14, fontWeight:700, marginBottom:8 }}>
            💰 Salary Tier <span style={{ fontSize:11, color:theme.td, fontWeight:400 }}>(Manager only)</span>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {["", ...TIERS].map(t => (
              <button key={t||"none"} onClick={() => setR(p => ({ ...p, tier:t }))} style={{
                flex:1, padding:"10px", borderRadius:10, fontWeight:700, cursor:"pointer",
                background: r.tier === t ? (TIER_COLORS[t] || theme.ch) : theme.ch,
                color: r.tier === t && t ? "#fff" : theme.tx,
                border: `1px solid ${r.tier === t ? (TIER_COLORS[t] || theme.bd) : theme.bd}`
              }}>{t ? `Tier ${t}` : "—"}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ padding:"14px 0" }}>
        <div style={{ color:theme.tx, fontSize:14, fontWeight:700, marginBottom:8 }}>📝 Notes</div>
        <textarea value={r.notes || ""} onChange={e => setR(p => ({ ...p, notes:e.target.value }))}
          rows={3} style={{ width:"100%", padding:10, borderRadius:8, background:theme.ch,
            color:theme.tx, border:`1px solid ${theme.bd}`, resize:"vertical", fontFamily:"inherit", fontSize:13 }} />
      </div>
      {r.updatedBy && (
        <div style={{ fontSize:11, color:theme.td, padding:"6px 0 10px" }}>
          Last updated by {r.updatedBy}
          {r.updatedAt && ` · ${fmtDt(r.updatedAt)}`}
        </div>
      )}
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
        <Bt onClick={onClose} outline={true}>Cancel</Bt>
        <Bt onClick={save}>Save</Bt>
      </div>
    </Modal>
  );
}

function Perf({ employees, isMgr, onSave }) {
  const [filterTier, setFilterTier] = useState("all");
  const [filterSec, setFilterSec] = useState("all");
  const [sortBy, setSortBy] = useState("grade");
  const [editEmp, setEditEmp] = useState(null);

  const rows = employees
    .filter(e => filterSec === "all" || e.section === filterSec)
    .filter(e => {
      if (filterTier === "all") return true;
      if (filterTier === "unrated") return !e.rating || !gradeFromRating(e.rating);
      return e.rating?.tier === filterTier;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      const ga = gradeFromRating(a.rating)?.label || "Z";
      const gb = gradeFromRating(b.rating)?.label || "Z";
      return ga.localeCompare(gb);
    });

  return (
    <div>
      <h2 style={{ color:theme.tx, fontSize:24, fontWeight:800, margin:"0 0 6px", letterSpacing:-0.3 }}>Performance</h2>
      <p style={{ color:theme.ts, fontSize:13, margin:"0 0 18px" }}>
        {isMgr ? "Rate employees and set salary tiers." : "Rate employees. Salary tier is set by the Manager."}
      </p>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
        <select value={filterSec} onChange={e => setFilterSec(e.target.value)} style={{
          padding:"8px 12px", background:theme.ch, color:theme.tx, borderRadius:8,
          border:`1px solid ${theme.bd}`, fontSize:13 }}>
          <option value="all">All sections</option>
          {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {isMgr && (
          <select value={filterTier} onChange={e => setFilterTier(e.target.value)} style={{
            padding:"8px 12px", background:theme.ch, color:theme.tx, borderRadius:8,
            border:`1px solid ${theme.bd}`, fontSize:13 }}>
            <option value="all">All tiers</option>
            {TIERS.map(t => <option key={t} value={t}>Tier {t}</option>)}
            <option value="unrated">Unrated</option>
          </select>
        )}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
          padding:"8px 12px", background:theme.ch, color:theme.tx, borderRadius:8,
          border:`1px solid ${theme.bd}`, fontSize:13 }}>
          <option value="grade">Sort by Grade</option>
          <option value="name">Sort by Name</option>
        </select>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:12 }}>
        {rows.map(e => {
          const grade = gradeFromRating(e.rating);
          const tier = e.rating?.tier;
          return (
            <div key={e.id} onClick={() => setEditEmp(e)} style={{
              background:theme.cs, border:`1px solid ${theme.bd}`, borderRadius:14,
              padding:14, cursor:"pointer"
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ color:theme.tx, fontSize:14, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{e.name}</div>
                  <div style={{ color:theme.td, fontSize:11, marginTop:2 }}>{e.section}</div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                  {grade && <Bd text={grade.label} color={grade.color} />}
                  {isMgr && tier && <Bd text={`Tier ${tier}`} color={TIER_COLORS[tier]} />}
                </div>
              </div>
              {grade ? (
                <div style={{ display:"flex", gap:6, marginTop:10 }}>
                  {RATING_KEYS.map(k => (
                    <div key={k.k} title={k.label} style={{
                      flex:1, height:6, borderRadius:4,
                      background: `rgba(245, 166, 35, ${((e.rating?.[k.k] || 0) / 5) * 0.9 + 0.1})`
                    }} />
                  ))}
                </div>
              ) : (
                <div style={{ color:theme.td, fontSize:11, marginTop:10, fontStyle:"italic" }}>Not yet rated — click to start</div>
              )}
            </div>
          );
        })}
      </div>

      {editEmp && <PerfEditor emp={editEmp} isMgr={isMgr} onSave={onSave} onClose={() => setEditEmp(null)} />}
    </div>
  );
}

/* ============================================================
   LEAVE FORM / CARD / PAGE / APPROVALS
   ============================================================ */

function LvFm({ onSub, onCan }) {
  const [f, setF] = useState({ type:"Annual Leave", startDate:"", endDate:"", reason:"" });
  const [er, setEr] = useState("");
  const days = f.startDate && f.endDate
    ? Math.max(1, Math.ceil((new Date(f.endDate) - new Date(f.startDate)) / 864e5) + 1)
    : 0;

  return (
    <div style={{ background:theme.cs, borderRadius:14, padding:22, border:`1px solid ${theme.bl}`, maxWidth:520 }}>
      <h3 style={{ fontSize:16, fontWeight:700, color:theme.tx, marginBottom:18 }}>📝 Apply for Leave</h3>
      {er && <div style={{
        background:"rgba(239,68,68,0.1)", borderRadius:8, padding:"8px 12px",
        marginBottom:12, color:theme.rd, fontSize:12
      }}>{er}</div>}
      <div style={{ marginBottom:14 }}>
        <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>TYPE</label>
        <select value={f.type} onChange={e => setF(p => ({ ...p, type:e.target.value }))}
          style={{ ...ib, background:theme.cs }}>
          {LEAVE_TYPES.map(tp => <option key={tp} value={tp}>{tp}</option>)}
        </select>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        <div>
          <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>START</label>
          <input type="date" value={f.startDate} onChange={e => setF(p => ({ ...p, startDate:e.target.value }))} style={ib} />
        </div>
        <div>
          <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>END</label>
          <input type="date" value={f.endDate} onChange={e => setF(p => ({ ...p, endDate:e.target.value }))} style={ib} />
        </div>
      </div>
      {days > 0 && (
        <div style={{
          background:`${theme.or}15`, borderRadius:8, padding:"8px 12px",
          marginBottom:14, fontSize:13, color:theme.or
        }}>{days} day{days > 1 ? "s" : ""}</div>
      )}
      <div style={{ marginBottom:18 }}>
        <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>REASON</label>
        <textarea value={f.reason} onChange={e => setF(p => ({ ...p, reason:e.target.value }))}
          rows={3} placeholder="Reason..." style={{ ...ib, resize:"vertical", fontFamily:"inherit" }} />
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <Bt onClick={() => {
          if (!f.startDate || !f.endDate || !f.reason.trim()) return setEr("Fill all fields");
          if (new Date(f.endDate) < new Date(f.startDate)) return setEr("Invalid dates");
          onSub({ ...f, days });
        }} bg={theme.gn}>📤 Submit</Bt>
        <Bt onClick={onCan} outline={true}>Cancel</Bt>
      </div>
    </div>
  );
}

function LvCd({ req, role, onAct }) {
  const [cm, setCm] = useState("");
  const [sa, setSa] = useState(false);
  const ca = (role === "teamlead" && req.status === "pending") || (role === "manager" && req.status === "tl_approved");
  return (
    <div style={{
      background:theme.card, borderRadius:14, padding:16,
      border:`1px solid ${theme.bd}`, borderLeft:`4px solid ${STATUS_COLORS[req.status]}`, marginBottom:10
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:6, marginBottom:8 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:theme.tx }}>{req.empName}</div>
          <div style={{ fontSize:11, color:theme.td }}>{req.section}</div>
        </div>
        <Bd text={STATUS_LABELS[req.status]} color={STATUS_COLORS[req.status]} />
      </div>
      <div style={{ fontSize:12, marginBottom:8, color:theme.ts }}>
        {req.type} • {req.startDate} → {req.endDate} ({req.days}d)
      </div>
      <div style={{
        background:theme.ch, borderRadius:8, padding:"8px 10px",
        marginBottom:8, fontSize:12, color:theme.ts
      }}>{req.reason}</div>
      {req.tlComment && (
        <div style={{ fontSize:11, marginBottom:4, color:theme.ts }}>
          <strong style={{ color:theme.tx }}>TL:</strong> {req.tlComment}
        </div>
      )}
      {req.mgrComment && (
        <div style={{ fontSize:11, marginBottom:4, color:theme.ts }}>
          <strong style={{ color:theme.tx }}>MGR:</strong> {req.mgrComment}
        </div>
      )}
      {ca && !sa && <Bt onClick={() => setSa(true)} small={true}>Take Action</Bt>}
      {ca && sa && (
        <div style={{ marginTop:8, background:theme.ch, borderRadius:10, padding:12 }}>
          <textarea value={cm} onChange={e => setCm(e.target.value)}
            rows={2} placeholder="Comment..." style={{ ...ib, marginBottom:8 }} />
          <div style={{ display:"flex", gap:6 }}>
            <Bt onClick={() => { onAct(req.id, "approve", cm); setSa(false); setCm(""); }} small={true} bg={theme.gn}>✅ Approve</Bt>
            <Bt onClick={() => { onAct(req.id, "reject", cm); setSa(false); setCm(""); }} small={true} bg={theme.rd}>❌ Reject</Bt>
            <Bt onClick={() => { setSa(false); setCm(""); }} small={true} outline={true}>Cancel</Bt>
          </div>
        </div>
      )}
    </div>
  );
}

function LvPg({ user, leaveRequests, onSub, onAct }) {
  const isE = user.role === "employee";
  const [tab, setTab] = useState(isE ? "my" : "all");
  const [sf, setSf] = useState(false);
  const my = leaveRequests.filter(r => r.empId === user.id);
  const pn = user.role === "teamlead"
    ? leaveRequests.filter(r => r.status === "pending")
    : user.role === "manager"
      ? leaveRequests.filter(r => r.status === "tl_approved") : [];
  const sh = tab === "my" ? my : tab === "pending" ? pn : leaveRequests;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, margin:0 }}>Leave Management</h2>
        {isE && <Bt onClick={() => setSf(true)} bg={theme.or}>📝 Apply</Bt>}
      </div>
      {isE && (
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:18 }}>
          <SC2 label="Annual Left" value={user.annualLeave - user.usedAnnual} color={theme.gn} icon="🏖️" />
          <SC2 label="Sick Left" value={user.sickLeave - user.usedSick} color={theme.rd} icon="🤒" />
        </div>
      )}
      {sf && (
        <div style={{ marginBottom:18 }}>
          <LvFm onSub={f => { onSub(f); setSf(false); }} onCan={() => setSf(false)} />
        </div>
      )}
      <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
        {isE && (
          <div onClick={() => setTab("my")} style={{
            padding:"7px 14px", borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:600,
            background: tab === "my" ? theme.pl : theme.card, color: tab === "my" ? "#fff" : theme.ts
          }}>My ({my.length})</div>
        )}
        {!isE && (
          <div onClick={() => setTab("all")} style={{
            padding:"7px 14px", borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:600,
            background: tab === "all" ? theme.pl : theme.card, color: tab === "all" ? "#fff" : theme.ts
          }}>All ({leaveRequests.length})</div>
        )}
        {!isE && (
          <div onClick={() => setTab("pending")} style={{
            padding:"7px 14px", borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:600,
            background: tab === "pending" ? theme.or : theme.card, color: tab === "pending" ? "#fff" : theme.ts, position:"relative"
          }}>
            Pending ({pn.length})
            {pn.length > 0 && (
              <span style={{
                position:"absolute", top:-5, right:-5, width:16, height:16, borderRadius:"50%",
                background:theme.rd, color:"#fff", fontSize:9, fontWeight:700,
                display:"flex", alignItems:"center", justifyContent:"center"
              }}>{pn.length}</span>
            )}
          </div>
        )}
      </div>
      {!sh.length
        ? <Empty text="No requests" />
        : sh.map(r => <LvCd key={r.id} req={r} role={user.role} onAct={onAct} />)}
    </div>
  );
}

function ApPg({ user, leaveRequests, onAct }) {
  const pn = user.role === "teamlead"
    ? leaveRequests.filter(r => r.status === "pending")
    : leaveRequests.filter(r => r.status === "tl_approved");
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, margin:0 }}>Leave Approvals</h2>
        {pn.length > 0 && <Bd text={`${pn.length} Pending`} color={theme.yl} />}
      </div>
      {!pn.length
        ? <div style={{ textAlign:"center", padding:40, color:theme.td }}>✅ All clear</div>
        : pn.map(r => <LvCd key={r.id} req={r} role={user.role} onAct={onAct} />)}
    </div>
  );
}

/* ============================================================
   LEAVE CALENDAR (NEW)
   ============================================================ */

function LeaveCalendar({ leaveRequests, employees }) {
  const [selectedMonth, setSelectedMonth] = useState(3); // April default
  const [selDay, setSelDay] = useState(null);
  const year = 2026;

  const firstDay = new Date(year, selectedMonth, 1).getDay();
  const daysInMonth = new Date(year, selectedMonth + 1, 0).getDate();
  const weeks = [];
  let current = [];
  for (let i = 0; i < firstDay; i++) current.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    current.push(d);
    if (current.length === 7) { weeks.push(current); current = []; }
  }
  if (current.length) {
    while (current.length < 7) current.push(null);
    weeks.push(current);
  }

  const onLeaveOn = (day) => {
    if (!day) return [];
    const dStr = `${year}-${String(selectedMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return leaveRequests.filter(r => {
      if (r.status === "rejected") return false;
      return dStr >= r.startDate && dStr <= r.endDate;
    });
  };

  const dayDetails = selDay != null ? onLeaveOn(selDay) : [];
  const dayStr = selDay != null
    ? `${year}-${String(selectedMonth+1).padStart(2,"0")}-${String(selDay).padStart(2,"0")}`
    : "";

  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, marginBottom:16 }}>Leave Calendar</h2>
      <p style={{ color:theme.ts, fontSize:13, marginBottom:16 }}>
        Plan approvals by spotting overlaps. Click a day to see everyone on leave that day.
      </p>

      <div style={{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" }}>
        {[0,1,2,3,4,5].map(m => (
          <div key={m} onClick={() => { setSelectedMonth(m); setSelDay(null); }} style={{
            padding:"8px 18px", borderRadius:10, cursor:"pointer",
            fontSize:13, fontWeight:600,
            background: selectedMonth === m ? theme.ga : theme.card,
            color: selectedMonth === m ? "#fff" : theme.ts
          }}>{MONTHS[m]} {year}</div>
        ))}
      </div>

      <div style={{ background:theme.card, borderRadius:14, padding:14, border:`1px solid ${theme.bd}`, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:6 }}>
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
            <div key={d} style={{
              padding:6, textAlign:"center", fontSize:10, fontWeight:700,
              color:theme.td, textTransform:"uppercase"
            }}>{d}</div>
          ))}
        </div>
        {weeks.map((w, wi) => (
          <div key={wi} style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:4 }}>
            {w.map((day, di) => {
              if (!day) return <div key={di} />;
              const leaves = onLeaveOn(day);
              const isSel = selDay === day;
              const bgColor = leaves.length === 0
                ? theme.ch
                : leaves.length >= 3 ? "rgba(239,68,68,0.20)"
                : leaves.length === 2 ? "rgba(245,158,11,0.20)"
                : "rgba(56,189,248,0.15)";
              const brColor = isSel ? theme.or
                : leaves.length >= 3 ? theme.rd
                : leaves.length === 2 ? theme.yl
                : leaves.length === 1 ? theme.bu
                : theme.bd;
              return (
                <div key={di} onClick={() => setSelDay(day)} style={{
                  minHeight:60, padding:6, borderRadius:8, cursor:"pointer",
                  background: bgColor, border:`1px solid ${brColor}`,
                  display:"flex", flexDirection:"column", gap:3,
                  transform: isSel ? "scale(1.03)" : "none", transition:"transform 0.15s"
                }}>
                  <div style={{ fontSize:12, fontWeight:700, color:theme.tx }}>{day}</div>
                  {leaves.length > 0 && (
                    <div style={{ fontSize:10, color:theme.ts, lineHeight:1.3 }}>
                      {leaves.slice(0,2).map(r => (
                        <div key={r.id} style={{
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                          color: r.status === "approved" ? theme.gn : r.status === "tl_approved" ? theme.bu : theme.yl
                        }}>{r.empName.split(" ")[0]}</div>
                      ))}
                      {leaves.length > 2 && <div style={{ color:theme.td }}>+{leaves.length - 2} more</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16 }}>
        <Bd text="Approved" color={theme.gn} />
        <Bd text="TL Approved" color={theme.bu} />
        <Bd text="Pending" color={theme.yl} />
        <Bd text="2+ overlapping = orange" color={theme.yl} />
        <Bd text="3+ overlapping = red" color={theme.rd} />
      </div>

      {selDay != null && (
        <Sec title={`${dayStr} - ${dayDetails.length} on leave`} icon="📅">
          {dayDetails.length === 0
            ? <Empty icon="✅" text="Everyone is on duty" />
            : dayDetails.map(r => (
              <div key={r.id} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"10px 0", borderBottom:`1px solid ${theme.bd}`, gap:6, flexWrap:"wrap"
              }}>
                <div>
                  <div style={{ fontSize:13, color:theme.tx, fontWeight:500 }}>{r.empName}</div>
                  <div style={{ fontSize:11, color:theme.td }}>{r.section} • {r.type}</div>
                </div>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <Bd text={`${r.days}d`} color={theme.bu} />
                  <Bd text={STATUS_LABELS[r.status]} color={STATUS_COLORS[r.status]} />
                </div>
              </div>
            ))}
        </Sec>
      )}
    </div>
  );
}

/* ============================================================
   ATTENDANCE (Working Hours + Roster Editor)
   ============================================================ */

function AttPg({ employees, selectedMonth, setSelectedMonth, onEditRoster, canEdit }) {
  const [sf, setSf] = useState("All");
  const [sr, setSr] = useState("");
  const [editEmp, setEditEmp] = useState(null);
  const fl = employees.filter(e => (sf === "All" || e.section === sf) && e.name.toLowerCase().includes(sr.toLowerCase()));
  const mk = `2026-${String(selectedMonth+1).padStart(2,"0")}`;

  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, marginBottom:16 }}>Attendance & Working Hours</h2>
      <div style={{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" }}>
        {[0,1,2,3,4,5].map(m => (
          <div key={m} onClick={() => setSelectedMonth(m)} style={{
            padding:"8px 18px", borderRadius:10, cursor:"pointer",
            fontSize:13, fontWeight:600,
            background: selectedMonth === m ? theme.ga : theme.card,
            color: selectedMonth === m ? "#fff" : theme.ts
          }}>{MONTHS[m]} 2026</div>
        ))}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {["All", ...SECTIONS].map(s => (
          <div key={s} onClick={() => setSf(s)} style={{
            padding:"6px 14px", borderRadius:8, cursor:"pointer",
            fontSize:12, fontWeight:600,
            background: sf === s ? theme.pl : theme.card,
            color: sf === s ? "#fff" : theme.ts
          }}>{s}</div>
        ))}
      </div>
      <input placeholder="🔍 Search..." value={sr} onChange={e => setSr(e.target.value)}
        style={{ ...ib, marginBottom:14 }} />
      <div style={{ background:theme.card, borderRadius:14, border:`1px solid ${theme.bd}`, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:"rgba(255,255,255,0.03)" }}>
                {["Employee","Section","Day","Night","Off","Leave","Sched","Worked","%",""].map(h => (
                  <th key={h} style={{
                    padding:"12px", textAlign:"left", color:theme.td,
                    fontWeight:700, fontSize:10, textTransform:"uppercase"
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fl.map(e => {
                const h = cH(e.roster?.[mk], e.section);
                const pc2 = h.sc > 0 ? Math.round(h.w / h.sc * 100) : 0;
                return (
                  <tr key={e.id} style={{ borderTop:`1px solid ${theme.bd}` }}>
                    <td style={{ padding:"10px 12px", color:theme.tx, fontWeight:500 }}>{e.name}</td>
                    <td style={{ padding:"10px 12px" }}><Bd text={e.section} color={theme.bu} /></td>
                    <td style={{ padding:"10px 12px", color:theme.gn, fontWeight:700 }}>{h.mc}</td>
                    <td style={{ padding:"10px 12px", color:theme.pu, fontWeight:700 }}>{h.nc}</td>
                    <td style={{ padding:"10px 12px", color:theme.td }}>{h.oc}</td>
                    <td style={{ padding:"10px 12px", color: h.lc > 0 ? theme.yl : theme.td, fontWeight: h.lc > 0 ? 700 : 400 }}>{h.lc}</td>
                    <td style={{ padding:"10px 12px", color:theme.tx, fontWeight:700 }}>{h.sc}h</td>
                    <td style={{ padding:"10px 12px", color:theme.gn, fontWeight:700 }}>{h.w}h</td>
                    <td style={{ padding:"10px 12px" }}>
                      <span style={{
                        padding:"3px 10px", borderRadius:12, fontSize:11, fontWeight:700,
                        background: pc2 >= 95 ? `${theme.gn}18` : pc2 >= 80 ? `${theme.yl}18` : `${theme.rd}18`,
                        color: pc2 >= 95 ? theme.gn : pc2 >= 80 ? theme.yl : theme.rd
                      }}>{pc2}%</span>
                    </td>
                    <td style={{ padding:"10px 12px" }}>
                      {canEdit && <Bt onClick={() => setEditEmp(e)} small={true} outline={true}>✏️ Edit Roster</Bt>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editEmp && (
        <Modal title={`Edit Roster - ${editEmp.name} (${MONTHS[selectedMonth]} 2026)`} onClose={() => setEditEmp(null)} width={720}>
          <RosterEditor emp={editEmp} mk={mk} onEdit={onEditRoster} />
        </Modal>
      )}
    </div>
  );
}

function RosterEditor({ emp, mk, onEdit }) {
  const ro = emp.roster?.[mk] || [];
  const cc = { M:theme.gn, N:theme.pu, O:theme.td, L:theme.yl };
  const cycle = { M:"N", N:"O", O:"L", L:"M" };

  return (
    <div>
      <p style={{ color:theme.ts, fontSize:12, marginBottom:14 }}>
        <strong style={{ color:theme.tx }}>Click a day</strong> to cycle: Morning → Night → Off → Leave
      </p>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14, fontSize:11, color:theme.ts }}>
        <div><span style={{ color:theme.gn, fontWeight:700 }}>M</span> Morning</div>
        <div><span style={{ color:theme.pu, fontWeight:700 }}>N</span> Night</div>
        <div><span style={{ color:theme.td, fontWeight:700 }}>O</span> Off</div>
        <div><span style={{ color:theme.yl, fontWeight:700 }}>L</span> Leave</div>
      </div>
      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
        {ro.map(d => {
          const dn = ["SU","MONTHS","TEAMLEAD_USER","WE","TH","FR","SA"][new Date(d.date).getDay()];
          return (
            <div key={d.day} onClick={() => onEdit(emp.id, mk, d.day, cycle[d.code] || "M")} style={{
              width:50, height:64, borderRadius:10,
              background: theme.ch, display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center",
              border:`1px solid ${d.code === "L" ? theme.yl+"40" : theme.bd}`,
              cursor:"pointer", transition:"all 0.15s"
            }}>
              <div style={{ fontSize:9, color:theme.td }}>{dn}</div>
              <div style={{ fontSize:14, fontWeight:700, color:theme.tx }}>{d.day}</div>
              <div style={{ fontSize:12, fontWeight:800, color: cc[d.code] || theme.td }}>{d.code}</div>
            </div>
          );
        })}
      </div>
      <div style={{
        marginTop:16, padding:12, background:"rgba(56,189,248,0.06)",
        borderRadius:8, fontSize:11, color:theme.ts, borderLeft:`3px solid ${theme.bu}`
      }}>
        ℹ️ Changes save automatically. Working hours and % compliance recalculate on close.
      </div>
    </div>
  );
}

function MyAtt({ emp, selectedMonth, setSelectedMonth }) {
  const cc = { M:theme.gn, N:theme.pu, O:theme.td, L:theme.yl };
  const mk = `2026-${String(selectedMonth+1).padStart(2,"0")}`;
  const ro = emp.roster?.[mk] || [];
  const h = cH(ro, emp.section);
  const ms = [0,1,2,3,4,5].map(m => {
    const k = `2026-${String(m+1).padStart(2,"0")}`;
    const hr = cH(emp.roster?.[k], emp.section);
    return { m:MONTHS[m], sc:hr.sc, w:hr.w, idx:m };
  });
  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, marginBottom:16 }}>My Attendance</h2>
      <Sec title="Monthly Working Hours" icon="📊">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10 }}>
          {ms.map(x => (
            <div key={x.m} onClick={() => setSelectedMonth(x.idx)} style={{
              background: selectedMonth === x.idx ? theme.pl+"20" : theme.ch,
              borderRadius:12, padding:14, cursor:"pointer",
              border:`1px solid ${selectedMonth === x.idx ? theme.pl : theme.bd}`, textAlign:"center"
            }}>
              <div style={{ fontSize:12, fontWeight:700, color: selectedMonth === x.idx ? theme.or : theme.ts, marginBottom:6 }}>{x.m}</div>
              <div style={{ fontSize:22, fontWeight:800, color:theme.gn }}>{x.w}h</div>
              <div style={{ fontSize:10, color:theme.td }}>of {x.sc}h</div>
              <div style={{ width:"100%", height:4, borderRadius:2, background:theme.bd, marginTop:8 }}>
                <div style={{
                  height:4, borderRadius:2, background:theme.gn,
                  width: x.sc > 0 ? `${Math.round(x.w/x.sc*100)}%` : "0%"
                }}/>
              </div>
            </div>
          ))}
        </div>
      </Sec>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:18 }}>
        <SC2 label="Scheduled" value={`${h.sc}h`} color={theme.bu} icon="📋" />
        <SC2 label="Worked" value={`${h.w}h`} color={theme.gn} icon="✅" />
        <SC2 label="Day" value={h.mc} color={theme.gn} icon="☀️" />
        <SC2 label="Night" value={h.nc} color={theme.pu} icon="🌙" />
      </div>
      <Sec title={`${MONTHS[selectedMonth]} 2026 Roster`} icon="📋">
        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
          {ro.map(d => {
            const dn = ["SU","MONTHS","TEAMLEAD_USER","WE","TH","FR","SA"][new Date(d.date).getDay()];
            return (
              <div key={d.day} style={{
                width:44, height:56, borderRadius:10, background:theme.ch,
                display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center",
                border:`1px solid ${d.code === "L" ? theme.yl+"40" : theme.bd}`
              }}>
                <div style={{ fontSize:9, color:theme.td }}>{dn}</div>
                <div style={{ fontSize:14, fontWeight:700, color:theme.tx }}>{d.day}</div>
                <div style={{ fontSize:11, fontWeight:800, color: cc[d.code] || theme.td }}>{d.code}</div>
              </div>
            );
          })}
        </div>
      </Sec>
    </div>
  );
}

/* ============================================================
   TRAINING
   ============================================================ */

function MyTr({ emp }) {
  const tr = emp.training || [];
  const valid = tr.filter(x => certSt(x.certExpiry).l === "VALID").length;
  const expiring = tr.filter(x => certSt(x.certExpiry).l === "EXPIRING").length;
  const expired = tr.filter(x => certSt(x.certExpiry).l === "EXPIRED").length;
  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, marginBottom:16 }}>My Training & Certifications</h2>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
        <SC2 label="Total" value={tr.length} color={theme.bu} icon="🎓" />
        <SC2 label="Valid" value={valid} color={theme.gn} icon="✅" />
        <SC2 label="Expiring" value={expiring} color={theme.yl} icon="⚠️" />
        <SC2 label="Expired" value={expired} color={theme.rd} icon="❌" />
      </div>
      <Sec title="Certificates" icon="📜">
        {tr.map(x => {
          const st = certSt(x.certExpiry);
          return (
            <div key={x.id} style={{
              background:theme.ch, borderRadius:12, padding:16, marginBottom:10,
              borderLeft:`4px solid ${st.c}`, display:"flex",
              justifyContent:"space-between", alignItems:"flex-start",
              flexWrap:"wrap", gap:10
            }}>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontSize:14, fontWeight:600, color:theme.tx }}>{x.title}</div>
                <div style={{ fontSize:12, color:theme.ts, marginTop:4 }}>{x.provider}</div>
                <div style={{ fontSize:12, color:theme.ts, marginTop:2 }}>
                  Cert: <span style={{ fontFamily:"monospace", color:theme.bu }}>{x.certNo}</span>
                </div>
                <div style={{ display:"flex", gap:16, marginTop:8 }}>
                  <div>
                    <div style={{ fontSize:9, color:theme.td, fontWeight:700 }}>COMPLETED</div>
                    <div style={{ fontSize:12, color:theme.tx }}>{x.completedDate}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:9, color:theme.td, fontWeight:700 }}>EXPIRES</div>
                    <div style={{ fontSize:12, color:st.c, fontWeight:600 }}>{x.certExpiry}</div>
                  </div>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <Bd text={st.l} color={st.c} />
                <div style={{ fontSize:11, color: st.d < 0 ? theme.rd : theme.td, marginTop:6, fontWeight:600 }}>
                  {st.d < 0 ? `${Math.abs(st.d)}d overdue` : `${st.d}d left`}
                </div>
              </div>
            </div>
          );
        })}
      </Sec>
    </div>
  );
}

function TrMatrix({ employees }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("matrix"); // "matrix" or "gap"

  const courses = TRAINING_CATALOG.filter(c =>
    (typeFilter === "all" || c.type === typeFilter) &&
    (!search || c.title.toLowerCase().includes(search.toLowerCase()))
  );

  // Gap view: for each employee, how many required courses are missing from their completed training
  const gaps = employees.map(e => {
    const roleCode = designationToRoleCode(e.designation);
    const required = TRAINING_CATALOG.filter(c => roleCode && c.roles.includes(roleCode));
    const completed = new Set((e.training || []).map(t => t.title.toLowerCase()));
    const missing = required.filter(c => !completed.has(c.title.toLowerCase()));
    return { emp:e, roleCode, required:required.length, completed:required.length - missing.length, missing:missing.length };
  }).sort((a, b) => b.missing - a.missing);

  const types = Array.from(new Set(TRAINING_CATALOG.map(c => c.type)));

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <button onClick={() => setView("matrix")} style={{
          padding:"8px 16px", borderRadius:10, fontWeight:700, cursor:"pointer", border:"none",
          background: view === "matrix" ? theme.pl : theme.ch, color: view === "matrix" ? "#fff" : theme.tx
        }}>📋 Course Matrix ({TRAINING_CATALOG.length})</button>
        <button onClick={() => setView("gap")} style={{
          padding:"8px 16px", borderRadius:10, fontWeight:700, cursor:"pointer", border:"none",
          background: view === "gap" ? theme.pl : theme.ch, color: view === "gap" ? "#fff" : theme.tx
        }}>⚠ Compliance Gap</button>
      </div>

      {view === "matrix" ? (
        <>
          <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{
              padding:"8px 12px", background:theme.ch, color:theme.tx, borderRadius:8,
              border:`1px solid ${theme.bd}`, fontSize:13 }}>
              <option value="all">All types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input placeholder="🔍 search course…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ flex:1, minWidth:200, padding:"8px 12px", background:theme.ch, color:theme.tx,
                borderRadius:8, border:`1px solid ${theme.bd}`, fontSize:13 }} />
          </div>
          <div style={{ fontSize:11, color:theme.td, marginBottom:8 }}>
            M = Mandatory for this role • Source: AUH AFM Training Need Analysis Matrix 2026
          </div>
          <div style={{ overflowX:"auto", background:theme.card, borderRadius:14, border:`1px solid ${theme.bd}` }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead>
                <tr style={{ background:"rgba(255,255,255,0.03)" }}>
                  <th style={{ padding:"10px 8px", textAlign:"left", color:theme.td, fontWeight:700, fontSize:10, textTransform:"uppercase", position:"sticky", left:0, background:theme.cs, zIndex:1 }}>Course</th>
                  <th style={{ padding:"10px 6px", color:theme.td, fontWeight:700, fontSize:10 }}>Freq</th>
                  {ROLE_ORDER.map(rc => (
                    <th key={rc} title={ROLE_CODES[rc]} style={{
                      padding:"10px 6px", color:theme.td, fontWeight:700, fontSize:10,
                      writingMode:"vertical-rl", transform:"rotate(180deg)",
                      minWidth:24, whiteSpace:"nowrap"
                    }}>{rc}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courses.map((c, i) => (
                  <tr key={i} style={{ borderTop:`1px solid ${theme.bd}` }}>
                    <td style={{ padding:"8px", color:theme.tx, position:"sticky", left:0, background:theme.cs, maxWidth:260 }}>
                      <div style={{ fontSize:12, fontWeight:600 }}>{c.title}</div>
                      <div style={{ fontSize:10, color:theme.td }}>{c.type} · {c.mode} · {c.dur}</div>
                    </td>
                    <td style={{ padding:"6px", color:theme.ts, fontSize:10, textAlign:"center" }}>{(c.freq||"").trim()}</td>
                    {ROLE_ORDER.map(rc => (
                      <td key={rc} style={{ padding:"6px", textAlign:"center" }}>
                        {c.roles.includes(rc) && (
                          <span style={{
                            display:"inline-block", minWidth:22, padding:"2px 6px", borderRadius:6,
                            background:"#15425f", color:"#fff", fontSize:10, fontWeight:800
                          }}>M</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:12, fontSize:10, color:theme.td }}>
            {ROLE_ORDER.map(rc => (
              <span key={rc}><b style={{ color:theme.tx }}>{rc}</b>: {ROLE_CODES[rc]}</span>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize:12, color:theme.ts, marginBottom:12 }}>
            For each employee, this shows how many mandatory courses (per their role) are completed.
          </div>
          <div style={{ background:theme.card, borderRadius:14, border:`1px solid ${theme.bd}`, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr style={{ background:"rgba(255,255,255,0.03)" }}>
                {["Employee","Section","Role","Completed","Required","Missing","Compliance"].map(h => (
                  <th key={h} style={{ padding:"12px", textAlign:"left", color:theme.td, fontWeight:700, fontSize:10, textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {gaps.map((g, i) => {
                  const pct = g.required ? Math.round((g.completed / g.required) * 100) : 0;
                  const color = pct >= 90 ? theme.gn : pct >= 60 ? theme.yl : theme.rd;
                  return (
                    <tr key={i} style={{ borderTop:`1px solid ${theme.bd}` }}>
                      <td style={{ padding:"10px 12px", color:theme.tx, fontWeight:500 }}>{g.emp.name}</td>
                      <td style={{ padding:"10px 12px" }}><Bd text={g.emp.section} color={theme.bu} /></td>
                      <td style={{ padding:"10px 12px", color:theme.ts, fontSize:11 }}>{g.roleCode || "—"}</td>
                      <td style={{ padding:"10px 12px", color:theme.gn, fontWeight:600 }}>{g.completed}</td>
                      <td style={{ padding:"10px 12px", color:theme.tx }}>{g.required}</td>
                      <td style={{ padding:"10px 12px", color: g.missing > 0 ? theme.rd : theme.gn, fontWeight:700 }}>{g.missing}</td>
                      <td style={{ padding:"10px 12px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:60, height:6, background:"rgba(255,255,255,0.08)", borderRadius:99 }}>
                            <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:99 }} />
                          </div>
                          <span style={{ fontSize:11, fontWeight:700, color }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function TrMgmt({ employees }) {
  const [tab, setTab] = useState("certs");
  const [sf, setSf] = useState("All");
  const [sr, setSr] = useState("");
  const [stf, setStf] = useState("all");
  const fl = employees.filter(e => (sf === "All" || e.section === sf) && e.name.toLowerCase().includes(sr.toLowerCase()));
  const ac = [];
  fl.forEach(e => {
    (e.training || []).forEach(x => {
      const st = certSt(x.certExpiry);
      const s2 = st.l === "EXPIRED" ? "expired" : st.l === "EXPIRING" ? "expiring" : "valid";
      if (stf === "all" || stf === s2) ac.push({ ...x, empName:e.name, section:e.section, st:s2, days:st.d, stc:st.c, stl:st.l });
    });
  });
  ac.sort((a,b) => a.days - b.days);
  const te = employees.reduce((a,e) => a + (e.training || []).filter(x => certSt(x.certExpiry).l === "EXPIRED").length, 0);
  const tx2 = employees.reduce((a,e) => a + (e.training || []).filter(x => certSt(x.certExpiry).l === "EXPIRING").length, 0);

  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, marginBottom:14 }}>Training & Certifications</h2>
      <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
        <button onClick={() => setTab("certs")} style={{
          padding:"8px 16px", borderRadius:10, fontWeight:700, cursor:"pointer", border:"none",
          background: tab === "certs" ? theme.pl : theme.ch, color: tab === "certs" ? "#fff" : theme.tx
        }}>🎓 Certificates</button>
        <button onClick={() => setTab("matrix")} style={{
          padding:"8px 16px", borderRadius:10, fontWeight:700, cursor:"pointer", border:"none",
          background: tab === "matrix" ? theme.pl : theme.ch, color: tab === "matrix" ? "#fff" : theme.tx
        }}>📋 TNA Matrix</button>
      </div>
      {tab === "matrix" ? <TrMatrix employees={employees} /> : (
      <>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
        <SC2 label="Total Certs" value={ac.length} color={theme.bu} icon="🎓" />
        <SC2 label="Expired" value={te} color={theme.rd} icon="❌" />
        <SC2 label="Expiring (90d)" value={tx2} color={theme.yl} icon="⚠️" />
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {["all","expired","expiring","valid"].map(s => (
          <div key={s} onClick={() => setStf(s)} style={{
            padding:"6px 14px", borderRadius:8, cursor:"pointer",
            fontSize:12, fontWeight:600,
            background: stf === s ? (s === "expired" ? theme.rd : s === "expiring" ? theme.yl : s === "valid" ? theme.gn : theme.pl) : theme.card,
            color: stf === s ? "#fff" : theme.ts, textTransform:"capitalize"
          }}>{s === "all" ? "All" : s}</div>
        ))}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {["All", ...SECTIONS].map(s => (
          <div key={s} onClick={() => setSf(s)} style={{
            padding:"6px 14px", borderRadius:8, cursor:"pointer",
            fontSize:12, fontWeight:600,
            background: sf === s ? theme.pl : theme.card,
            color: sf === s ? "#fff" : theme.ts
          }}>{s}</div>
        ))}
      </div>
      <input placeholder="🔍 Search..." value={sr} onChange={e => setSr(e.target.value)}
        style={{ ...ib, marginBottom:14 }} />
      <div style={{ background:theme.card, borderRadius:14, border:`1px solid ${theme.bd}`, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:"rgba(255,255,255,0.03)" }}>
                {["Employee","Section","Training","Cert No","Completed","Expires","Status"].map(h => (
                  <th key={h} style={{
                    padding:"12px", textAlign:"left", color:theme.td,
                    fontWeight:700, fontSize:10, textTransform:"uppercase"
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!ac.length
                ? <tr><td colSpan={7} style={{ padding:30, textAlign:"center", color:theme.td }}>No certificates</td></tr>
                : ac.map((c,i) => (
                  <tr key={i} style={{ borderTop:`1px solid ${theme.bd}` }}>
                    <td style={{ padding:"10px 12px", color:theme.tx, fontWeight:500 }}>{c.empName}</td>
                    <td style={{ padding:"10px 12px" }}><Bd text={c.section} color={theme.bu} /></td>
                    <td style={{ padding:"10px 12px", color:theme.tx }}>{c.title}</td>
                    <td style={{ padding:"10px 12px", color:theme.bu, fontFamily:"monospace", fontSize:11 }}>{c.certNo}</td>
                    <td style={{ padding:"10px 12px", color:theme.ts }}>{c.completedDate}</td>
                    <td style={{ padding:"10px 12px", color:c.stc, fontWeight:600 }}>{c.certExpiry}</td>
                    <td style={{ padding:"10px 12px" }}>
                      <span style={{
                        padding:"3px 10px", borderRadius:12, fontSize:10, fontWeight:700,
                        background:`${c.stc}18`, color:c.stc
                      }}>{c.stl} ({c.days < 0 ? Math.abs(c.days) + "d ago" : c.days + "d"})</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/* ============================================================
   DOCUMENTS (NEW - employee + management)
   ============================================================ */

function MyDocs({ emp, onAdd, onDel }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type:"passport", title:"", docNo:"", issueDate:"", expiryDate:"", fileName:""
  });
  const [er, setEr] = useState("");

  const docs = emp.documents || [];
  const valid = docs.filter(d => certSt(d.expiryDate).l === "VALID").length;
  const expiring = docs.filter(d => certSt(d.expiryDate).l === "EXPIRING").length;
  const expired = docs.filter(d => certSt(d.expiryDate).l === "EXPIRED").length;

  const submit = () => {
    setEr("");
    if (!form.title.trim() || !form.docNo.trim() || !form.expiryDate) return setEr("Title, document number and expiry date required");
    onAdd(emp.id, { ...form, fileName: form.fileName || form.title.toLowerCase().replace(/\s+/g,"_") + ".pdf" });
    setForm({ type:"passport", title:"", docNo:"", issueDate:"", expiryDate:"", fileName:"" });
    setShowForm(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, margin:0 }}>My Documents</h2>
        <Bt onClick={() => setShowForm(true)} bg={theme.or}>📄 Add Document</Bt>
      </div>

      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
        <SC2 label="Total" value={docs.length} color={theme.bu} icon="📁" />
        <SC2 label="Valid" value={valid} color={theme.gn} icon="✅" />
        <SC2 label="Expiring" value={expiring} color={theme.yl} icon="⚠️" />
        <SC2 label="Expired" value={expired} color={theme.rd} icon="❌" />
      </div>

      {showForm && (
        <Modal title="Add New Document" onClose={() => setShowForm(false)}>
          {er && <div style={{
            background:"rgba(239,68,68,0.1)", borderRadius:8, padding:"8px 12px",
            marginBottom:12, color:theme.rd, fontSize:12
          }}>{er}</div>}
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>TYPE</label>
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type:e.target.value }))}
              style={{ ...ib, background:theme.cs }}>
              {DOC_TYPES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>TITLE</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title:e.target.value }))}
              placeholder="e.g. UAE Employment Visa" style={ib} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>DOCUMENT NUMBER</label>
            <input value={form.docNo} onChange={e => setForm(p => ({ ...p, docNo:e.target.value }))}
              placeholder="e.g. AB1234567" style={ib} />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
            <div>
              <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>ISSUE DATE</label>
              <input type="date" value={form.issueDate} onChange={e => setForm(p => ({ ...p, issueDate:e.target.value }))} style={ib} />
            </div>
            <div>
              <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>EXPIRY DATE *</label>
              <input type="date" value={form.expiryDate} onChange={e => setForm(p => ({ ...p, expiryDate:e.target.value }))} style={ib} />
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>FILE NAME (simulated upload)</label>
            <input value={form.fileName} onChange={e => setForm(p => ({ ...p, fileName:e.target.value }))}
              placeholder="e.g. passport_scan.pdf" style={ib} />
            <div style={{ fontSize:10, color:theme.td, marginTop:4 }}>
              ℹ️ In production, this would be a real file upload to secure storage.
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Bt onClick={submit} bg={theme.gn}>💾 Save</Bt>
            <Bt onClick={() => setShowForm(false)} outline={true}>Cancel</Bt>
          </div>
        </Modal>
      )}

      <Sec title="My Documents" icon="📁">
        {docs.length === 0
          ? <Empty icon="📁" text="No documents uploaded. Click 'Add Document' to upload passport, visa, EID, etc." />
          : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:12 }}>
              {docs.map(d => {
                const st = certSt(d.expiryDate);
                const typeInfo = DOC_TYPES.find(x => x.key === d.type) || DOC_TYPES[DOC_TYPES.length - 1];
                return (
                  <div key={d.id} style={{
                    background:theme.ch, borderRadius:12, padding:16,
                    borderLeft:`4px solid ${st.c}`
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                      <div style={{ fontSize:24 }}>{typeInfo.icon}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:theme.tx }}>{d.title}</div>
                        <div style={{ fontSize:10, color:theme.td, textTransform:"uppercase", fontWeight:700 }}>{typeInfo.label}</div>
                      </div>
                      <Bd text={st.l} color={st.c} />
                    </div>
                    <div style={{ fontSize:11, color:theme.ts, marginBottom:4 }}>
                      <strong style={{ color:theme.tx }}>No:</strong> <span style={{ fontFamily:"monospace" }}>{d.docNo}</span>
                    </div>
                    <div style={{ fontSize:11, color:theme.ts, marginBottom:4 }}>
                      <strong style={{ color:theme.tx }}>Expires:</strong> <span style={{ color:st.c, fontWeight:600 }}>{d.expiryDate}</span>
                      {" "}({st.d < 0 ? `${Math.abs(st.d)}d ago` : `${st.d}d`})
                    </div>
                    {d.fileName && (
                      <div style={{ fontSize:10, color:theme.bu, marginTop:6, display:"flex", alignItems:"center", gap:4 }}>
                        📎 {d.fileName}
                      </div>
                    )}
                    <div style={{ marginTop:10 }}>
                      <Bt onClick={() => onDel(emp.id, d.id)} small={true} bg={theme.rd}>🗑️ Remove</Bt>
                    </div>
                  </div>
                );
              })}
            </div>}
      </Sec>
    </div>
  );
}

function DocsMgmt({ employees, onSel }) {
  const [sf, setSf] = useState("All");
  const [sr, setSr] = useState("");
  const [stf, setStf] = useState("all");

  const fl = employees.filter(e => (sf === "All" || e.section === sf) && e.name.toLowerCase().includes(sr.toLowerCase()));
  const ac = [];
  fl.forEach(e => {
    (e.documents || []).forEach(d => {
      const st = certSt(d.expiryDate);
      const s2 = st.l === "EXPIRED" ? "expired" : st.l === "EXPIRING" ? "expiring" : "valid";
      if (stf === "all" || stf === s2) ac.push({ ...d, empId:e.id, empName:e.name, section:e.section, days:st.d, stc:st.c, stl:st.l });
    });
  });
  ac.sort((a,b) => a.days - b.days);

  const te = employees.reduce((a,e) => a + (e.documents || []).filter(x => certSt(x.expiryDate).l === "EXPIRED").length, 0);
  const tx2 = employees.reduce((a,e) => a + (e.documents || []).filter(x => certSt(x.expiryDate).l === "EXPIRING").length, 0);
  const tv = employees.reduce((a,e) => a + (e.documents || []).filter(x => certSt(x.expiryDate).l === "VALID").length, 0);

  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, marginBottom:16 }}>Employee Documents</h2>
      <p style={{ color:theme.ts, fontSize:13, marginBottom:16 }}>
        Track passport, visa, EID, airport pass and medical fitness expiry across the team.
      </p>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
        <SC2 label="Total Docs" value={ac.length} color={theme.bu} icon="📁" />
        <SC2 label="Valid" value={tv} color={theme.gn} icon="✅" />
        <SC2 label="Expiring (90d)" value={tx2} color={theme.yl} icon="⚠️" />
        <SC2 label="Expired" value={te} color={theme.rd} icon="❌" />
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {["all","expired","expiring","valid"].map(s => (
          <div key={s} onClick={() => setStf(s)} style={{
            padding:"6px 14px", borderRadius:8, cursor:"pointer",
            fontSize:12, fontWeight:600,
            background: stf === s ? (s === "expired" ? theme.rd : s === "expiring" ? theme.yl : s === "valid" ? theme.gn : theme.pl) : theme.card,
            color: stf === s ? "#fff" : theme.ts, textTransform:"capitalize"
          }}>{s === "all" ? "All" : s}</div>
        ))}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {["All", ...SECTIONS].map(s => (
          <div key={s} onClick={() => setSf(s)} style={{
            padding:"6px 14px", borderRadius:8, cursor:"pointer",
            fontSize:12, fontWeight:600,
            background: sf === s ? theme.pl : theme.card,
            color: sf === s ? "#fff" : theme.ts
          }}>{s}</div>
        ))}
      </div>
      <input placeholder="🔍 Search employee..." value={sr} onChange={e => setSr(e.target.value)}
        style={{ ...ib, marginBottom:14 }} />
      <div style={{ background:theme.card, borderRadius:14, border:`1px solid ${theme.bd}`, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:"rgba(255,255,255,0.03)" }}>
                {["Employee","Section","Document","Doc No","Expires","Status",""].map(h => (
                  <th key={h} style={{
                    padding:"12px", textAlign:"left", color:theme.td,
                    fontWeight:700, fontSize:10, textTransform:"uppercase"
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!ac.length
                ? <tr><td colSpan={7} style={{ padding:30, textAlign:"center", color:theme.td }}>No documents match filters</td></tr>
                : ac.map((c,i) => {
                  const ti = DOC_TYPES.find(x => x.key === c.type) || DOC_TYPES[DOC_TYPES.length - 1];
                  return (
                    <tr key={i} style={{ borderTop:`1px solid ${theme.bd}` }}>
                      <td style={{ padding:"10px 12px", color:theme.tx, fontWeight:500 }}>{c.empName}</td>
                      <td style={{ padding:"10px 12px" }}><Bd text={c.section} color={theme.bu} /></td>
                      <td style={{ padding:"10px 12px", color:theme.tx }}>{ti.icon} {c.title}</td>
                      <td style={{ padding:"10px 12px", color:theme.bu, fontFamily:"monospace", fontSize:11 }}>{c.docNo}</td>
                      <td style={{ padding:"10px 12px", color:c.stc, fontWeight:600 }}>{c.expiryDate}</td>
                      <td style={{ padding:"10px 12px" }}>
                        <span style={{
                          padding:"3px 10px", borderRadius:12, fontSize:10, fontWeight:700,
                          background:`${c.stc}18`, color:c.stc
                        }}>{c.stl} ({c.days < 0 ? Math.abs(c.days) + "d ago" : c.days + "d"})</span>
                      </td>
                      <td style={{ padding:"10px 12px" }}>
                        <Bt onClick={() => onSel(employees.find(e => e.id === c.empId))} small={true} outline={true}>View Employee</Bt>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ANNOUNCEMENTS (NEW)
   ============================================================ */

function AnnPg({ user, announcements, employees, onAdd, onDel }) {
  const canCompose = user.role === "manager" || user.role === "teamlead";
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title:"", message:"", priority:"info", pinned:false, target:"all" });
  const [er, setEr] = useState("");
  const [filter, setFilter] = useState("all");

  const visible = user.role === "employee"
    ? announcements.filter(a => a.target === "all" || a.target === user.section)
    : announcements;
  const filtered = filter === "all" ? visible : visible.filter(a => a.priority === filter);
  const pinned = filtered.filter(a => a.pinned);
  const regular = filtered.filter(a => !a.pinned);

  const submit = () => {
    setEr("");
    if (!form.title.trim() || !form.message.trim()) return setEr("Title and message required");
    onAdd(form);
    setForm({ title:"", message:"", priority:"info", pinned:false, target:"all" });
    setShowForm(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, margin:0 }}>Announcements</h2>
        {canCompose && <Bt onClick={() => setShowForm(true)} bg={theme.or}>📢 Post Announcement</Bt>}
      </div>

      {showForm && (
        <Modal title="Post Announcement" onClose={() => setShowForm(false)} width={620}>
          {er && <div style={{
            background:"rgba(239,68,68,0.1)", borderRadius:8, padding:"8px 12px",
            marginBottom:12, color:theme.rd, fontSize:12
          }}>{er}</div>}
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>TITLE</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title:e.target.value }))}
              placeholder="e.g. LVO Operations Alert" style={ib} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>MESSAGE</label>
            <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message:e.target.value }))}
              rows={5} placeholder="Write the full announcement here..."
              style={{ ...ib, resize:"vertical", fontFamily:"inherit" }} />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
            <div>
              <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>PRIORITY</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority:e.target.value }))}
                style={{ ...ib, background:theme.cs }}>
                {ANN_PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>TARGET</label>
              <select value={form.target} onChange={e => setForm(p => ({ ...p, target:e.target.value }))}
                style={{ ...ib, background:theme.cs }}>
                <option value="all">All Team</option>
                {SECTIONS.map(s => <option key={s} value={s}>{s} only</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:theme.ts, cursor:"pointer" }}>
              <input type="checkbox" checked={form.pinned}
                onChange={e => setForm(p => ({ ...p, pinned:e.target.checked }))}
                style={{ width:16, height:16, accentColor:theme.or }} />
              📌 Pin to top (shows on dashboards)
            </label>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Bt onClick={submit} bg={theme.gn}>📤 Post</Bt>
            <Bt onClick={() => setShowForm(false)} outline={true}>Cancel</Bt>
          </div>
        </Modal>
      )}

      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        <div onClick={() => setFilter("all")} style={{
          padding:"6px 14px", borderRadius:8, cursor:"pointer",
          fontSize:12, fontWeight:600,
          background: filter === "all" ? theme.pl : theme.card,
          color: filter === "all" ? "#fff" : theme.ts
        }}>All ({visible.length})</div>
        {ANN_PRIORITIES.map(pr => {
          const count = visible.filter(a => a.priority === pr.key).length;
          return (
            <div key={pr.key} onClick={() => setFilter(pr.key)} style={{
              padding:"6px 14px", borderRadius:8, cursor:"pointer",
              fontSize:12, fontWeight:600,
              background: filter === pr.key ? pr.color : theme.card,
              color: filter === pr.key ? "#fff" : theme.ts
            }}>{pr.label} ({count})</div>
          );
        })}
      </div>

      {pinned.length > 0 && (
        <Sec title="Pinned" icon="📌">
          {pinned.map(a => <AnnCard key={a.id} a={a} canDel={canCompose} onDel={onDel} />)}
        </Sec>
      )}

      {regular.length > 0
        ? <Sec title="Recent" icon="📢">
            {regular.map(a => <AnnCard key={a.id} a={a} canDel={canCompose} onDel={onDel} />)}
          </Sec>
        : pinned.length === 0 && <Empty text="No announcements" />}
    </div>
  );
}

function AnnCard({ a, canDel, onDel }) {
  const pr = ANN_PRIORITIES.find(p => p.key === a.priority);
  return (
    <div style={{
      background:theme.ch, borderRadius:12, padding:16,
      borderLeft:`4px solid ${pr.color}`, marginBottom:10
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            {a.pinned && <span style={{ fontSize:12 }}>📌</span>}
            <div style={{ fontSize:14, fontWeight:700, color:theme.tx }}>{a.title}</div>
            <Bd text={pr.label.toUpperCase()} color={pr.color} />
          </div>
          <div style={{ fontSize:10, color:theme.td, marginTop:4 }}>
            {fmtDt(a.date)} • {a.by} • {a.target === "all" ? "All Team" : a.target}
          </div>
        </div>
        {canDel && (
          <button onClick={() => onDel(a.id)} style={{
            background:"none", border:"none", color:theme.td, cursor:"pointer", fontSize:14, padding:4
          }}>🗑️</button>
        )}
      </div>
      <div style={{ fontSize:13, color:theme.ts, marginTop:10, lineHeight:1.5, whiteSpace:"pre-wrap" }}>{a.message}</div>
    </div>
  );
}

/* ============================================================
   RENDER
   ============================================================ */

ReactDOM.render(<App />, document.getElementById("root"));

// Register service worker for PWA install capability
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
