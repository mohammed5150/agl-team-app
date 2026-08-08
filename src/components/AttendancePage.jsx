import { SECTIONS, MONTHS, ATT_MONTHS, theme } from "../constants.js";
import { cH } from "../helpers.js";
import { ib, Bd, Bt, SC2, Sec, Modal } from "../uiPrimitives.jsx";

const { useState } = React;

/* ============================================================
   ATTENDANCE (Working Hours + Roster Editor)
   ============================================================ */

export function AttPg({ employees, selectedMonth, setSelectedMonth, onEditRoster, canEdit }) {
  const [sf, setSf] = useState("All");
  const [sr, setSr] = useState("");
  const [editEmp, setEditEmp] = useState(null);
  const fl = employees.filter(e => (sf === "All" || e.section === sf) && e.name.toLowerCase().includes(sr.toLowerCase()));
  const mk = `2026-${String(selectedMonth+1).padStart(2,"0")}`;

  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, marginBottom:16 }}>Attendance & Working Hours</h2>
      <div style={{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" }}>
        {ATT_MONTHS.map(m => (
          <button type="button" key={m} onClick={() => setSelectedMonth(m)} style={{
            padding:"8px 18px", borderRadius:10, cursor:"pointer",
            fontSize:13, fontWeight:600,
            background: selectedMonth === m ? theme.ga : theme.card, border:"none",
            color: selectedMonth === m ? "#fff" : theme.ts
          }}>{MONTHS[m]} 2026</button>
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

export function RosterEditor({ emp, mk, onEdit }) {
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
          const dn = ["SU","MO","TU","WE","TH","FR","SA"][new Date(d.date).getDay()];
          return (
            <div key={d.day} onClick={() => onEdit(emp.id, mk, d.day, cycle[d.code] || "M")} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(emp.id, mk, d.day, cycle[d.code] || "M"); } }} style={{
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

export function MyAtt({ emp, selectedMonth, setSelectedMonth }) {
  const cc = { M:theme.gn, N:theme.pu, O:theme.td, L:theme.yl };
  const mk = `2026-${String(selectedMonth+1).padStart(2,"0")}`;
  const ro = emp.roster?.[mk] || [];
  const h = cH(ro, emp.section);
  const ms = ATT_MONTHS.map(m => {
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
            <div key={x.m} onClick={() => setSelectedMonth(x.idx)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedMonth(x.idx); } }} style={{
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
            const dn = ["SU","MO","TU","WE","TH","FR","SA"][new Date(d.date).getDay()];
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
