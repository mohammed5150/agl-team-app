import { SECTIONS, ANN_PRIORITIES, theme } from "../constants.js";
import { fmtDt } from "../helpers.js";
import { ib, Bd, Bt, Sec, Modal, Empty } from "../uiPrimitives.jsx";

const { useState } = React;

/* ============================================================
   ANNOUNCEMENTS (NEW)
   ============================================================ */

export function AnnPg({ user, announcements, onAdd, onDel }) {
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
        <button type="button" onClick={() => setFilter("all")} style={{
          padding:"6px 14px", borderRadius:8, cursor:"pointer",
          fontSize:12, fontWeight:600,
          background: filter === "all" ? theme.pl : theme.card, border:"none",
          color: filter === "all" ? "#fff" : theme.ts
        }}>All ({visible.length})</button>
        {ANN_PRIORITIES.map(pr => {
          const count = visible.filter(a => a.priority === pr.key).length;
          return (
            <button type="button" key={pr.key} onClick={() => setFilter(pr.key)} style={{
              padding:"6px 14px", borderRadius:8, cursor:"pointer",
              fontSize:12, fontWeight:600,
              background: filter === pr.key ? pr.color : theme.card, border:"none",
              color: filter === pr.key ? "#fff" : theme.ts
            }}>{pr.label} ({count})</button>
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

export const AnnCard = React.memo(function AnnCard({ a, canDel, onDel }) {
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
          <button type="button" aria-label={`Delete announcement: ${a.title}`} onClick={() => onDel(a.id)} style={{
            background:"none", border:"none", color:theme.td, cursor:"pointer", fontSize:14, padding:4
          }}>🗑️</button>
        )}
      </div>
      <div style={{ fontSize:13, color:theme.ts, marginTop:10, lineHeight:1.5, whiteSpace:"pre-wrap" }}>{a.message}</div>
    </div>
  );
});

