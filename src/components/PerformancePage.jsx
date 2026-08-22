import { SECTIONS, theme } from "../constants.js";
import { RATING_KEYS, gradeFromRating, TIERS, TIER_COLORS } from "../rating.js";
import { fmtDt } from "../helpers.js";
import { Bd, Bt, Modal } from "../uiPrimitives.jsx";
import { GlyphIcon } from "../icons.jsx";

const { useState } = React;

/* ============================================================
   PERFORMANCE / RATINGS (TL + Manager)
   ============================================================ */

export function StarRow({ value, onChange, editable }) {
  return (
    <div style={{ display:"flex", gap:4 }}>
      {[1,2,3,4,5].map(n => (
        // Editable stars are tap targets, so they get the full 44px square.
        // Read-only ones are just a score readout and stay compact.
        <button key={n} onClick={() => editable && onChange(n)} disabled={!editable} style={{
          width: editable ? 44 : 28, height: editable ? 44 : 28,
          background:"none", border:"none", padding:0,
          cursor: editable ? "pointer" : "default", fontSize:22, lineHeight:1,
          color: n <= (value||0) ? "#f5a623" : "rgba(255,255,255,0.2)"
        }}>★</button>
      ))}
    </div>
  );
}

export function PerfEditor({ emp, isMgr, onSave, onClose }) {
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
            <span style={{ color:theme.ol, display:"inline-flex" }}><GlyphIcon glyph={icon} size={18} /></span>
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
            <GlyphIcon glyph="coins" size={15} style={{ color:theme.ol }} /> Salary Tier <span style={{ fontSize:11, color:theme.td, fontWeight:400 }}>(Manager only)</span>
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
        <div style={{ color:theme.tx, fontSize:14, fontWeight:700, marginBottom:8, display:"flex", alignItems:"center", gap:7 }}><GlyphIcon glyph="pencil" size={14} style={{ color:theme.ol }} /> Notes</div>
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

export function Perf({ employees, isMgr, onSave }) {
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

