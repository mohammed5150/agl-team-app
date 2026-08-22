import { SECTIONS, DOC_TYPES, theme } from "../constants.js";
import { certSt } from "../helpers.js";
import { ib, Bd, Bt, SC2, Sec, Modal, Empty } from "../uiPrimitives.jsx";
import { GlyphIcon } from "../icons.jsx";

const { useState } = React;

/* ============================================================
   DOCUMENTS (NEW - employee + management)
   ============================================================ */

export function MyDocs({ emp, onAdd, onDel }) {
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
        <Bt onClick={() => setShowForm(true)} bg={theme.or}><GlyphIcon glyph="file-text" size={13} /> Add Document</Bt>
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
            <Bt onClick={submit} bg={theme.gn}><GlyphIcon glyph="save" size={13} /> Save</Bt>
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
                      <div style={{ color:theme.ol, display:"flex" }}><GlyphIcon glyph={typeInfo.icon} size={24} /></div>
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
                        <GlyphIcon glyph="paperclip" size={12} /> {d.fileName}
                      </div>
                    )}
                    <div style={{ marginTop:10 }}>
                      <Bt onClick={() => onDel(emp.id, d.id)} small={true} bg={theme.rd}><GlyphIcon glyph="trash" size={12} /> Remove</Bt>
                    </div>
                  </div>
                );
              })}
            </div>}
      </Sec>
    </div>
  );
}

export function DocsMgmt({ employees, onSel }) {
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
      <input placeholder="Search employee..." value={sr} onChange={e => setSr(e.target.value)}
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
                      <td style={{ padding:"10px 12px", color:theme.tx }}><span style={{ display:"inline-flex", alignItems:"center", gap:7 }}><span style={{ color:theme.ol, display:"inline-flex" }}><GlyphIcon glyph={ti.icon} size={14} /></span>{c.title}</span></td>
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
