import { P12, P8, PHD, PSY, gR } from "./rosterPatterns.js";

const mE = (id, nm, sec, des, pi, band, airport, supplier, em) => {
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
      const parts = nm.toLowerCase().split(" ").filter(Boolean);
      const local = parts.length > 1 ? parts[0] + "." + parts[parts.length - 1] : parts[0];
      return local.replace(/[^a-z.]/g, "") + "@example.invalid";
    })(),
    name: nm, section: sec, designation: des,
    // Performance band from the salary standardisation exercise. null = not
    // graded in that exercise (direct staff, or trade still to be confirmed).
    band: band || null,
    // null = airport not assigned in the source report (3 workers).
    airport: airport || null,
    supplier: supplier || null,
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

function buildSeed() {
  // Roster reconciled against the ADB manpower salary standardisation report
  // (final, 14-Jul-2026): 81 supplied workers across 5 airports, merged with
  // the 8 people the portal already carried who are not in that supplier list.
  // Columns: id, name, section, designation, roster pattern, band, airport,
  // supplier. No salary, invoice rate or cut-list data is carried across.
  //
  // Section drives the shift pattern and attendance grid. Matched workers keep
  // the section the portal already had; workers added from the report take
  // Systems / High Masts / Helpdesk where the trade maps unambiguously, and
  // otherwise default to "AGL 8hrs" pending shift confirmation.
  const ROSTER = [
  ["EMP-001", "Amarnath Munderi",                 "AGL 12hrs", "AGL Technician",      0, null, "ZIA",  null              ],
  ["EMP-002", "Subash Chouhan",                   "AGL 12hrs", "AGL Technician",      0, "C",  "ZIA",  "Bahar Al Rayan"  ],
  ["EMP-003", "Thauseef Khan",                    "AGL 12hrs", "Sr. AGL Technician",  0, "B",  "ZIA",  "EVC"             ],
  ["EMP-004", "Abubaker Irshad",                  "AGL 12hrs", "AGL Technician",      1, null, "ZIA",  null              ],
  ["EMP-005", "Gopakumar Gopinathan",             "AGL 12hrs", "AGL Supervisor",      3, "A",  "ZIA",  "EVC"             ],
  ["EMP-006", "Babloo Sharma",                    "AGL 12hrs", "AGL Electrician",     3, "C",  "ZIA",  "Al Burj"         ],
  ["EMP-007", "Upendra",                          "AGL 12hrs", "AGL Technician",      3, "C",  "ZIA",  "Al Burj"         ],
  ["EMP-008", "Gineesh Navaratna",                "AGL 12hrs", "AGL Technician",      3, "C",  "ZIA",  "EVC"             ],
  ["EMP-009", "Anurag Aikkal",                    "AGL 12hrs", "AGL Technician",      2, null, "ZIA",  null              ],
  ["EMP-010", "Abhijith",                         "AGL 12hrs", "AGL Technician",      2, "C",  "ZIA",  "EVC"             ],
  ["EMP-011", "Shaji Kolavayal",                  "AGL 12hrs", "Sr. AGL Technician",  2, "B",  "ZIA",  "EVC"             ],
  ["EMP-012", "Dhaneesh Punnakkal",               "AGL 12hrs", "AGL Supervisor",      1, "A",  "ZIA",  "Techlor"         ],
  ["EMP-013", "Badarul Muneer",                   "AGL 12hrs", "FMV Driver",          1, "D",  "ZIA",  "Epic"            ],
  ["EMP-014", "Vikram Pal",                       "AGL 12hrs", "Sr. AGL Technician",  1, "B",  "ZIA",  "Al Burj"         ],
  ["EMP-015", "Latheef Ummer",                    "AGL 12hrs", "FMV Driver",          1, "D",  "ZIA",  "Al Burj"         ],
  ["EMP-016", "Thomas Padipurakkal",              "AGL 12hrs", "Sr. AGL Technician",  1, "B",  "ZIA",  "Al Burj"         ],
  ["EMP-017", "Faheem Muhammed",                  "AGL 8hrs",  "AGL Technician",      0, null, "ZIA",  null              ],
  ["EMP-018", "Sanoop Louis",                     "AGL 8hrs",  "AGL Technician",      0, null, "ZIA",  null              ],
  ["EMP-019", "Nisar Ahmed",                      "AGL 8hrs",  "AGL Technician",      1, null, "ZIA",  null              ],
  ["EMP-020", "Jiji Varghese",                    "AGL 8hrs",  "AGL Supervisor",      0, "A",  "ZIA",  "Epic"            ],
  ["EMP-021", "Inchody Dinesh Ram",               "AGL 8hrs",  "AGL Technician",      0, "C",  "ZIA",  "EVC"             ],
  ["EMP-022", "Monish Menothparambil",            "AGL 8hrs",  "Sr. AGL Technician",  0, "B",  "ZIA",  "Techlor"         ],
  ["EMP-023", "Nikhil Koyoon",                    "AGL 8hrs",  "Helper",              0, "E",  "ZIA",  "Techlor"         ],
  ["EMP-024", "Sura Uthaman",                     "AGL 8hrs",  "AGL Electrician",     1, "C",  "ZIA",  "EVC"             ],
  ["EMP-025", "Ganesan Subramanian",              "AGL 8hrs",  "AGL Supervisor",      1, "A",  "ZIA",  "Al Burj"         ],
  ["EMP-026", "Gajendran Nagasundaram",           "AGL 8hrs",  "Sr. AGL Technician",  0, "B",  "ZIA",  "Al Burj"         ],
  ["EMP-027", "Tahseen Khan",                     "AGL 8hrs",  "AGL Electrician",     0, "C",  "ZIA",  "EVC"             ],
  ["EMP-028", "Abhishekh Pujari",                 "AGL 8hrs",  "Helper",              0, "E",  "ZIA",  "Techlor"         ],
  ["EMP-029", "Muthukumar Cinniah",               "AGL 8hrs",  "AGL Technician",      0, "C",  "ZIA",  "EVC"             ],
  ["EMP-030", "Shigin Menothparambil",            "AGL 8hrs",  "Helper",              0, "E",  "ZIA",  "Techlor"         ],
  ["EMP-031", "Musthafa Erchat",                  "AGL 8hrs",  "AGL Technician",      0, null, "ZIA",  null              ],
  ["EMP-032", "Vineeth Patteri",                  "AGL 8hrs",  "AGL Electrician",     0, "C",  "ZIA",  "EVC"             ],
  ["EMP-033", "Shanmugadas Raju",                 "AGL 8hrs",  "AGL Electrician",     0, "C",  "ZIA",  "EVC"             ],
  ["EMP-034", "Manish Yadav",                     "AGL 8hrs",  "Helper",              0, "E",  "ZIA",  "Techlor"         ],
  ["EMP-035", "Midhun Babu",                      "AGL 8hrs",  "Sr. AGL Technician",  0, "B",  "ZIA",  "Techlor"         ],
  ["EMP-036", "Sandeep Selvan",                   "AGL 8hrs",  "AGL Electrician",     1, "C",  "ZIA",  "EVC"             ],
  ["EMP-037", "Danish Khan",                      "AGL 8hrs",  "AGL Technician",      0, "C",  "ZIA",  "EVC"             ],
  ["EMP-038", "Rajesh Kanna Nagarajan",           "AGL 8hrs",  "Sr. AGL Technician",  0, "B",  "ZIA",  "Al Burj"         ],
  ["EMP-039", "Mahthab Imdadullah",               "AGL 8hrs",  "AGL Technician",      0, "C",  "ZIA",  "Techlor"         ],
  ["EMP-040", "Raju Kolavayal",                   "AGL 8hrs",  "AGL Electrician",     0, "C",  "ZIA",  "Techlor"         ],
  ["EMP-041", "Prasath Maharajan",                "AGL 8hrs",  "Helper",              1, "E",  "ZIA",  "Best Wheel"      ],
  ["EMP-042", "Adhul KP",                         "AGL 8hrs",  "AGL Supervisor",      0, "A",  "ZIA",  "Techlor"         ],
  ["EMP-043", "Musthafa Neduvally",               "AGL 8hrs",  "FMV Driver",          0, "D",  "ZIA",  "Techlor"         ],
  ["EMP-044", "Mani Sanker",                      "Helpdesk",  "Helpdesk Operator",   0, "C",  "ZIA",  "EVC"             ],
  ["EMP-045", "Rishan Muhammed",                  "Helpdesk",  "Systems Technician",  2, "C",  "ZIA",  "Techlor"         ],
  ["EMP-046", "Yadhunath Kaitheri",               "Helpdesk",  "Sr. AGL Technician",  1, "B",  "ZIA",  "EVC"             ],
  ["EMP-047", "Sreevatsa Pushpalatha",            "Helpdesk",  "AGL Electrician",     1, "C",  "ZIA",  "Techlor"         ],
  ["EMP-048", "Farhan Muhammed",                  "Helpdesk",  "AGL Supervisor",      1, "A",  "ZIA",  "Al Burj"         ],
  ["EMP-049", "Prajesh Kadavankandi",             "Systems",   "Systems Technician",  0, "C",  "ZIA",  "EVC"             ],
  ["EMP-050", "Nithin Kumar",                     "Systems",   "Systems Technician",  1, null, "ZIA",  null              ],
  ["EMP-051", "Haris Muhammed",                   "Systems",   "Systems Technician",  0, "C",  "ZIA",  "EVC"             ],
  ["EMP-052", "Praveen Arunachalam",              "Systems",   "Systems Technician",  1, "C",  "ZIA",  "EVC"             ],
  ["EMP-053", "Balamurugan Maharaja",             "Systems",   "Systems Technician",  0, "C",  "ZIA",  "Al Burj"         ],
  ["EMP-054", "Syed Mussafir Shah",               "High Masts", "AGL Supervisor",      0, "A",  "ZIA",  "Bahar Al Rayan"  ],
  ["EMP-055", "Abhishek Aramban",                 "High Masts", "Sr. AGL Technician",  0, "B",  "ZIA",  "EVC"             ],
  ["EMP-056", "Divakar Gunasekaran",              "High Masts", "Sr. AGL Technician",  1, "B",  "ZIA",  "Techlor"         ],
  ["EMP-057", "Jijo Sebastian",                   "High Masts", "High Mast Technician", 0, "C",  "ZIA",  "EVC"             ],
  ["EMP-058", "Mustafah Arshad",                  "High Masts", "FMV Driver",          0, "D",  "ZIA",  "Epic"            ],
  ["EMP-059", "Ayyappan Shanmugam",               "AGL 8hrs",  "AGL Supervisor",      0, "A",  "XSB",  "Al Burj"         ],
  ["EMP-060", "Neeraj",                           "AGL 8hrs",  "Sr. AGL Technician",  0, "B",  "ZIA",  "Al Burj"         ],
  ["EMP-061", "Abdul Jaleel",                     "AGL 8hrs",  "FMV Driver",          0, "D",  "ZDY",  "Bahar Al Rayan"  ],
  ["EMP-062", "Abu Bakar",                        "AGL 8hrs",  "FMV Driver",          0, "D",  "ZIA",  "Bahar Al Rayan"  ],
  ["EMP-063", "Aftab",                            "AGL 8hrs",  "AGL Technician",      0, "C",  "AZI",  "Bahar Al Rayan"  ],
  ["EMP-064", "Sanilal",                          "AGL 8hrs",  "AGL Supervisor",      0, "A",  "AZI",  "Bahar Al Rayan"  ],
  ["EMP-065", "Venkatesh Selvam",                 "AGL 8hrs",  "AGL Supervisor",      0, "A",  "ZDY",  "Bahar Al Rayan"  ],
  ["EMP-066", "Niddish",                          "AGL 8hrs",  "AGL Technician",      0, "C",  "AAN",  "Best Wheel"      ],
  ["EMP-067", "Mohammed Parakkal",                "AGL 8hrs",  "FMV Driver",          0, "D",  "AZI",  "Techlor"         ],
  ["EMP-068", "Saji Gangadhran",                  "AGL 8hrs",  "AGL Supervisor",      0, "A",  "AAN",  "Epic"            ],
  ["EMP-069", "Umair Latif",                      "AGL 8hrs",  "AGL Technician",      0, "C",  "AAN",  "Epic"            ],
  ["EMP-070", "Arun Kumar Paswan",                "AGL 8hrs",  "AGL Technician",      0, "C",  "AAN",  "EVC"             ],
  ["EMP-071", "Kalidas Nagasundaram",             "AGL 8hrs",  "AGL Technician",      0, "C",  "AAN",  "EVC"             ],
  ["EMP-072", "Krishnamoorthy Mahalingam",        "AGL 8hrs",  "Sr. AGL Technician",  0, "B",  "AAN",  "EVC"             ],
  ["EMP-073", "Kumar Muthu Kanan",                "Systems",   "Systems Technician",  0, "C",  "ZIA",  "EVC"             ],
  ["EMP-074", "Mahamood Panakada",                "AGL 8hrs",  "FMV Driver",          0, "D",  "AZI",  "EVC"             ],
  ["EMP-075", "Mohammad Dilshad Khan Sohrab Khan", "AGL 8hrs",  "Sr. AGL Technician",  0, "B",  "AAN",  "EVC"             ],
  ["EMP-076", "Mohammad Tariq Mohammad",          "AGL 8hrs",  "AGL Technician",      0, "C",  "AAN",  "EVC"             ],
  ["EMP-077", "Mohan Kurunthalingm",              "AGL 8hrs",  "AGL Technician",      0, "C",  "AAN",  "EVC"             ],
  ["EMP-078", "Pirabaharan Thirisugu",            "AGL 8hrs",  "Sr. AGL Technician",  0, "B",  "AAN",  "EVC"             ],
  ["EMP-079", "Prasenakumar Sreedharan",          "AGL 8hrs",  "AGL Technician",      0, "C",  "AZI",  "EVC"             ],
  ["EMP-080", "Praveen Koothoor",                 "AGL 8hrs",  "AGL Technician",      0, "C",  null,   "EVC"             ],
  ["EMP-081", "Ramamoorthy Sunararaj",            "AGL 8hrs",  "Sr. AGL Technician",  0, "B",  "AAN",  "EVC"             ],
  ["EMP-082", "Rippon Mia",                       "AGL 8hrs",  "AGL Electrician",     0, "C",  "AZI",  "EVC"             ],
  ["EMP-083", "Sujith Pathukudi",                 "AGL 8hrs",  "AGL Technician",      0, "C",  "AAN",  "EVC"             ],
  ["EMP-084", "Muhsin Hamid Abdul Hamid",         "AGL 8hrs",  "AGL Technician",      0, "C",  null,   "EVC"             ],
  ["EMP-085", "Faiz Rasool",                      "AGL 8hrs",  "Sr. AGL Technician",  0, "B",  "XSB",  "Power Boult"     ],
  ["EMP-086", "Donick Dizon",                     "AGL 8hrs",  "Sr. AGL Technician",  0, "B",  "AZI",  "Techlor"         ],
  ["EMP-087", "Girish Kumar",                     "AGL 8hrs",  "AGL Supervisor",      0, "A",  "AZI",  "Techlor"         ],
  ["EMP-088", "Khalifa",                          "AGL 8hrs",  "AGL Technician",      0, "C",  "AZI",  "Techlor"         ],
  ["EMP-089", "Jesudas Kaleekal Thomas",          "Systems",   "Systems Technician",  0, "C",  "ZIA",  "Techlor"         ]
  ];

  const employees = ROSTER.map(r => mE(...r));

// Seed some performance records so demo has content
employees[0].achievements = [
  { id:1, title:"Best Performer - Q1 2026", date:"2026-03-31", by:"Ragesh Menon", desc:"Outstanding performance in AGL maintenance" },
  { id:2, title:"Safety Champion Award", date:"2026-02-15", by:"Mohammed Faheem", desc:"Zero incidents for 12 consecutive months" }
];
employees[0].actions = [
  { id:1, type:"commendation", title:"Letter of Appreciation", date:"2026-01-20", by:"Mohammed Faheem", desc:"Exceptional work during runway maintenance" }
];
employees[2].warnings = [
  { id:1, title:"Late Attendance Warning", date:"2026-03-10", by:"Mohammed Faheem", desc:"3 instances of late reporting in March", severity:"minor" }
];
employees[6].achievements = [
  { id:1, title:"Technical Excellence Award", date:"2026-02-28", by:"Ragesh Menon", desc:"Successfully led high mast retrofit project" }
];
employees[6].actions = [
  { id:1, type:"warning", title:"Verbal Warning - PPE", date:"2026-03-15", by:"Mohammed Faheem", desc:"Not wearing safety harness at height" }
];

const teamlead = {
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

const manager = {
  id:"MGR-001", email:"ragesh.menon@example.invalid",
  name:"Ragesh Menon", role:"manager", designation:"Maintenance Manager", section:"All", shift:"General",
  nationality:"Indian", mobile:"+971 50 333 0001", empNo:"ADB-3001",
  dob:"1980-07-10", maritalStatus:"Married", address:"Abu Dhabi, UAE", joinDate:"2012-01-15",
  emergencyContact:"+971 50 333 0002", emergencyName:"N/A",
  passportNo:"", passportExpiry:"", visaExpiry:"",
  eidNo:"784-XXXX-XXXXXXX-X", eidExpiry:"2028-12-31",
  annualLeave:30, usedAnnual:3, sickLeave:15, usedSick:0, compOff:0,
  documents:[], training:[]
};

const leaveRequests = [
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

const announcements = [
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

const notifications = [
  { id:"NF-SEED-001", to:"TL-001", type:"new_request", message:"New leave: Amarnath Munderi - Annual Leave (4d)", read:false, date:"2026-04-18T10:30:00" },
  { id:"NF-SEED-002", to:"MGR-001", type:"new_request", message:"Faheem Muhammed's leave approved by TL", read:false, date:"2026-04-15T14:00:00" },
  { id:"NF-SEED-003", to:"EMP-049", type:"approved", message:"Annual Leave APPROVED ✅", read:true, date:"2026-04-11T09:30:00" }
];

  return { employees, teamlead, manager, leaveRequests, announcements, notifications };
}

// Demo/seed data (real team roster) is compiled OUT of production bundles:
// build.js defines __SHOW_DEMO__=false unless SHOW_DEMO_LOGIN is explicitly
// enabled, and esbuild then drops buildSeed() entirely via dead-code
// elimination. Tooling that does not define the symbol (vitest) gets seeds.
const EMPTY = { employees: [], teamlead: null, manager: null, leaveRequests: [], announcements: [], notifications: [] };
const seed = (typeof __SHOW_DEMO__ !== "undefined" ? __SHOW_DEMO__ : true) ? buildSeed() : EMPTY;

export const INITIAL_EMPLOYEES      = seed.employees;
export const TEAMLEAD_USER          = seed.teamlead;
export const MANAGER_USER           = seed.manager;
export const INITIAL_LEAVE_REQUESTS = seed.leaveRequests;
export const INITIAL_ANNOUNCEMENTS  = seed.announcements;
export const INITIAL_NOTIFICATIONS  = seed.notifications;

export const nfId = () => `NF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
