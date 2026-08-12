// Extracted from app.jsx — AUH AFM Training Need Analysis Matrix 2026
export const ROLE_CODES = {
  MM:"AGL Maintenance Manager", AM:"AGL Manager", SEM:"System Eng. Manager",
  HDE:"HD Technical Engineer", OM:"Office Manager", QHS:"QHSE Engineer",
  TL:"AGL Team Leader", SL:"AGL Shift Leader", EL:"Electricians",
  GW:"General Workers", AT:"AGL Technician", MD:"MEWP driver",
  CH:"Store / Chemical handlers", FD:"FMV/ADP Driver"
};
export const ROLE_ORDER = ["MM","AM","SEM","HDE","OM","QHS","TL","SL","EL","GW","AT","MD","CH","FD"];
// Map an employee's designation (free text) to role codes in the matrix
export const designationToRoleCode = des => {
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

export const TRAINING_CATALOG = [
  {"title": "EAT (GCAS) - Airside Safety Induction Training", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "GAA Induction Training", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "SINYAR HSE Induction", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "SINYAR AVSEC Awareness", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  // The same two contractor inductions again, for WASAEL. They appear in the
  // 2026 training register but were missing here, so the 31 people holding the
  // HSE induction and the 16 holding AVSEC showed the certificate on their
  // profile while the coverage matrix ignored it entirely.
  //
  // Duration, mode and frequency are copied from the SINYAR pair rather than
  // invented: the register carries dates and nothing else, and these are the
  // same induction under a different manpower contractor. Required for every
  // role for the same reason the SINYAR and GAA inductions are — the holders
  // already span nine designations across seven suppliers, and under-reporting
  // a missing safety induction is worse than the noise of over-reporting one.
  {"title": "WASAEL HSE Induction", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "WASAEL AVSEC Awareness", "dur": "01h", "mode": "eLearn", "freq": "Annual", "type": "HSE", "roles": ["AM", "SEM", "HDE", "OM", "QHS", "TL", "SL", "EL", "GW", "AT", "MD", "CH", "FD"]},
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
  {"title": "night operations safety", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Manual Handling", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]},
  {"title": "Safe use of hand tools and power tools", "dur": "00h", "mode": "Class", "freq": "Monthly ", "type": "HSE", "roles": ["EL", "GW", "AT", "MD", "CH", "FD"]}
];
