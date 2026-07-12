import { LEAVE_TYPES, STATUS_COLORS, STATUS_LABELS, theme } from "../constants.js";
import { ib, Bd, Bt, SC2, Empty } from "../uiPrimitives.jsx";

const { useState } = React;

/* ============================================================
   LEAVE FORM / CARD / PAGE / APPROVALS
   ============================================================ */

export function LvFm({ onSub, onCan }) {
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

export function LvCd({ req, role, viewerId, onAct }) {
  const [cm, setCm] = useState("");
  const [sa, setSa] = useState(false);
  const ca = (role === "teamlead" && req.status === "pending") || (role === "manager" && req.status === "tl_approved");
  const canWithdraw = viewerId === req.empId && req.status === "pending";
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
      {canWithdraw && <Bt onClick={() => onAct(req.id, "withdraw")} small={true} outline={true}>↩ Withdraw</Bt>}
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

export function LvPg({ user, leaveRequests, onSub, onAct }) {
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
        : sh.map(r => <LvCd key={r.id} req={r} role={user.role} viewerId={user.id} onAct={onAct} />)}
    </div>
  );
}

export function ApPg({ user, leaveRequests, onAct }) {
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
        : pn.map(r => <LvCd key={r.id} req={r} role={user.role} viewerId={user.id} onAct={onAct} />)}
    </div>
  );
}

