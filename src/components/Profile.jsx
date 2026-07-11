import { theme } from "../constants.js";
import { TIERS_CAP, TIER_CAP_COLORS } from "../rating.js";
import { certSt } from "../helpers.js";
import { ib, Bd, Bt, Sec, Fd, Empty } from "../uiPrimitives.jsx";

const { useState, useEffect } = React;

/* ============================================================
   PROFILE
   ============================================================ */

export function Prof({ emp, canEdit, onSave, onAdd, isStaff, isMgr }) {
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

