import { SECTIONS, theme } from "../constants.js";
import { ROLE_CODES, ROLE_ORDER, designationToRoleCode, TRAINING_CATALOG } from "../trainingCatalog.js";
import { certSt } from "../helpers.js";
import { ib, Bd, SC2, Sec } from "../uiPrimitives.jsx";
import { GlyphIcon } from "../icons.jsx";

const { useState } = React;

/* ============================================================
   TRAINING
   ============================================================ */

export function MyTr({ emp }) {
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

export function TrMatrix({ employees }) {
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
        }}><GlyphIcon glyph="clipboard" size={12} style={{ verticalAlign:"-2px" }} /> Course Matrix ({TRAINING_CATALOG.length})</button>
        <button onClick={() => setView("gap")} style={{
          padding:"8px 16px", borderRadius:10, fontWeight:700, cursor:"pointer", border:"none",
          background: view === "gap" ? theme.pl : theme.ch, color: view === "gap" ? "#fff" : theme.tx
        }}><GlyphIcon glyph="alert-triangle" size={12} style={{ verticalAlign:"-2px" }} /> Compliance Gap</button>
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
            <input placeholder="Search course…" value={search} onChange={e => setSearch(e.target.value)}
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

export function TrMgmt({ employees }) {
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
        }}><GlyphIcon glyph="grad-cap" size={12} style={{ verticalAlign:"-2px" }} /> Certificates</button>
        <button onClick={() => setTab("matrix")} style={{
          padding:"8px 16px", borderRadius:10, fontWeight:700, cursor:"pointer", border:"none",
          background: tab === "matrix" ? theme.pl : theme.ch, color: tab === "matrix" ? "#fff" : theme.tx
        }}><GlyphIcon glyph="clipboard" size={12} style={{ verticalAlign:"-2px" }} /> TNA Matrix</button>
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
          <button type="button" key={s} onClick={() => setStf(s)} style={{
            padding:"6px 14px", borderRadius:8, cursor:"pointer",
            fontSize:12, fontWeight:600,
            background: stf === s ? (s === "expired" ? theme.rd : s === "expiring" ? theme.yl : s === "valid" ? theme.gn : theme.pl) : theme.card, border:"none",
            color: stf === s ? "#fff" : theme.ts, textTransform:"capitalize"
          }}>{s === "all" ? "All" : s}</button>
        ))}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {["All", ...SECTIONS].map(s => (
          <button type="button" key={s} onClick={() => setSf(s)} style={{
            padding:"6px 14px", borderRadius:8, cursor:"pointer",
            fontSize:12, fontWeight:600,
            background: sf === s ? theme.pl : theme.card, border:"none",
            color: sf === s ? "#fff" : theme.ts
          }}>{s}</button>
        ))}
      </div>
      <input aria-label="Search certificates" placeholder="Search…" value={sr} onChange={e => setSr(e.target.value)}
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
