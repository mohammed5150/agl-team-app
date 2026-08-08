import { theme, SHIFT_HOURS } from "./constants.js";

export function parseCSV(text) {
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

export function nextEmpId(employees, role) {
  const prefix = role === "manager" ? "MGR" : role === "teamlead" ? "TL" : "EMP";
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = employees.reduce((m, e) => {
    const n = re.exec(e.id || "");
    return n ? Math.max(m, parseInt(n[1], 10)) : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export const cH = (r, s) => {
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

export const certSt = exp => {
  if (!exp) return { l:"—", c:theme.td, d:0 };
  const expDate = new Date(exp);
  if (isNaN(expDate.getTime())) return { l:"—", c:theme.td, d:0 };
  const d = (expDate - new Date()) / 864e5;
  return d < 0 ? { l:"EXPIRED", c:theme.rd, d:Math.ceil(d) }
       : d <= 90 ? { l:"EXPIRING", c:theme.yl, d:Math.ceil(d) }
       : { l:"VALID", c:theme.gn, d:Math.ceil(d) };
};

export const fmtDt = iso => {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now - d) / 36e5;
  if (diffH < 1) return Math.max(1, Math.round(diffH*60)) + "m ago";
  if (diffH < 24) return Math.round(diffH) + "h ago";
  if (diffH < 48) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day:"2-digit", month:"short" });
};

export const daysInRange = (s, e) => {
  const out = [];
  const d = new Date(s);
  const end = new Date(e);
  while (d <= end) {
    out.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return out;
};
