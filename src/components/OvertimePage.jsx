import { STATUS_COLORS, OT_STATUS_LABELS, theme } from "../constants.js";
import { approvedHours } from "../overtimeWorkflow.js";
import { ib, Bd, Bt, SC2, Empty } from "../uiPrimitives.jsx";
import { validateOvertimeRequest, claimedHoursOn } from "../validation.js";
import { GlyphIcon } from "../icons.jsx";

const { useState, useMemo } = React;

/* ============================================================
   OVERTIME FORM / CARD / PAGE
   Team-lead-terminal: a manager can view overtime but never
   approves it, so no manager tab or action controls exist here.
   ============================================================ */

export function OtFm({ onSub, onCan, user, overtimeRequests, leaveRequests }) {
  const [f, setF] = useState({ workDate: "", hours: "", reason: "" });
  const [errors, setErrors] = useState([]);
  const hours = Number(f.hours) || 0;

  // Live warnings while the date is being picked — "you already claimed 4h on
  // this date", "you were on leave that day" — rather than after Submit.
  const live = useMemo(
    () => validateOvertimeRequest(f, {
      employee: user, requests: overtimeRequests, leaveRequests,
    }),
    [f, user, overtimeRequests, leaveRequests]
  );
  const already = user && f.workDate
    ? claimedHoursOn(overtimeRequests, user.id, f.workDate)
    : 0;

  const submit = () => {
    const res = validateOvertimeRequest(f, {
      employee: user, requests: overtimeRequests, leaveRequests,
    });
    if (!res.ok) { setErrors(res.errors); return; }
    setErrors([]);
    onSub({ workDate: f.workDate, hours, reason: f.reason });
  };

  return (
    <div style={{ background:theme.cs, borderRadius:14, padding:22, border:`1px solid ${theme.bl}`, maxWidth:520 }}>
      <h3 style={{ fontSize:16, fontWeight:700, color:theme.tx, marginBottom:18, display:"flex", alignItems:"center", gap:8 }}><GlyphIcon glyph="clock" size={16} style={{ color:theme.ol }} /> Claim Overtime</h3>
      {errors.length > 0 && (
        <div role="alert" aria-live="assertive" style={{
          background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
          borderRadius:8, padding:"8px 12px", marginBottom:12, color:theme.rd, fontSize:12
        }}>
          {errors.map((e, i) => <div key={i} style={{ marginTop: i ? 4 : 0 }}><GlyphIcon glyph="alert-triangle" size={13} style={{ verticalAlign:"-2px" }} /> {e}</div>)}
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        <div>
          <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>WORK DATE</label>
          <input type="date" value={f.workDate}
            onChange={e => setF(p => ({ ...p, workDate:e.target.value }))} style={ib} />
        </div>
        <div>
          <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>HOURS</label>
          <input type="number" min="0.5" max="12" step="0.5" value={f.hours}
            onChange={e => setF(p => ({ ...p, hours:e.target.value }))} placeholder="e.g. 3.5" style={ib} />
        </div>
      </div>
      {hours > 0 && (
        <div style={{
          background:`${theme.or}15`, borderRadius:8, padding:"8px 12px",
          marginBottom:14, fontSize:13, color:theme.or
        }}>
          {hours} hour{hours === 1 ? "" : "s"} — approved by your team lead
          {already > 0 && <> · {already}h already claimed on this date</>}
        </div>
      )}
      <div style={{ marginBottom:18 }}>
        <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>REASON</label>
        <textarea value={f.reason} onChange={e => setF(p => ({ ...p, reason:e.target.value }))}
          rows={3} placeholder="What was the work?" style={{ ...ib, resize:"vertical", fontFamily:"inherit" }} />
      </div>
      {live.warnings.length > 0 && (
        <div role="status" aria-live="polite" style={{
          background:`${theme.yl}12`, border:`1px solid ${theme.yl}35`,
          borderRadius:8, padding:"8px 12px", marginBottom:14,
          color:theme.yl, fontSize:12, lineHeight:1.6
        }}>
          {live.warnings.map((w, i) => <div key={i} style={{ marginTop: i ? 4 : 0 }}>ℹ️ {w}</div>)}
        </div>
      )}
      <div style={{ display:"flex", gap:8 }}>
        <Bt onClick={submit} bg={theme.gn}><GlyphIcon glyph="send" size={13} /> Submit</Bt>
        <Bt onClick={onCan} outline={true}>Cancel</Bt>
      </div>
    </div>
  );
}

export const OtCd = React.memo(function OtCd({ req, role, viewerId, onAct }) {
  const [cm, setCm] = useState("");
  const [sa, setSa] = useState(false);
  // Only a team lead acts, and only while pending. Managers get no controls.
  const ca = role === "teamlead" && req.status === "pending";
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
        <Bd text={OT_STATUS_LABELS[req.status]} color={STATUS_COLORS[req.status]} />
      </div>
      <div style={{ fontSize:12, marginBottom:8, color:theme.ts }}>
        {req.workDate} • <strong style={{ color:theme.or }}>{req.hours}h</strong>
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
      {ca && !sa && <Bt onClick={() => setSa(true)} small={true}>Take Action</Bt>}
      {canWithdraw && <Bt onClick={() => onAct(req.id, "withdraw")} small={true} outline={true}>↩ Withdraw</Bt>}
      {ca && sa && (
        <div style={{ marginTop:8, background:theme.ch, borderRadius:10, padding:12 }}>
          <textarea value={cm} onChange={e => setCm(e.target.value)}
            rows={2} aria-label="Comment on this claim" placeholder="Comment…" style={{ ...ib, marginBottom:8 }} />
          <div style={{ display:"flex", gap:6 }}>
            <Bt onClick={() => { onAct(req.id, "approve", cm); setSa(false); setCm(""); }} small={true} bg={theme.gn}><GlyphIcon glyph="check-square" size={12} /> Approve</Bt>
            <Bt onClick={() => { onAct(req.id, "reject", cm); setSa(false); setCm(""); }} small={true} bg={theme.rd}><GlyphIcon glyph="x-circle" size={12} /> Reject</Bt>
            <Bt onClick={() => { setSa(false); setCm(""); }} small={true} outline={true}>Cancel</Bt>
          </div>
        </div>
      )}
    </div>
  );
});

export function OtPg({ user, overtimeRequests, leaveRequests, onSub, onAct }) {
  const isE = user.role === "employee";
  const isTL = user.role === "teamlead";
  const [tab, setTab] = useState(isE ? "my" : "all");
  const [sf, setSf] = useState(false);
  const my = overtimeRequests.filter(r => r.empId === user.id);
  // Only a team lead has a pending queue — a manager has nothing to action.
  const pn = isTL ? overtimeRequests.filter(r => r.status === "pending") : [];
  const sh = tab === "my" ? my : tab === "pending" ? pn : overtimeRequests;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, margin:0 }}>Overtime</h2>
        {isE && <Bt onClick={() => setSf(true)} bg={theme.or}><GlyphIcon glyph="clock" size={13} /> Claim</Bt>}
      </div>
      {isE && (
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:18 }}>
          <SC2 label="Approved Hours" value={approvedHours(overtimeRequests, user.id)} color={theme.gn} icon="⏱️" />
          <SC2 label="Pending" value={my.filter(r => r.status === "pending").length} color={theme.yl} icon="⏳" />
        </div>
      )}
      {!isE && (
        <div style={{ fontSize:11, color:theme.td, marginBottom:14 }}>
          {isTL
            ? "You are the final approver for overtime — it does not escalate to the manager."
            : "Overtime is approved by team leads. This view is read-only."}
        </div>
      )}
      {sf && (
        <div style={{ marginBottom:18 }}>
          <OtFm onSub={f => { onSub(f); setSf(false); }} onCan={() => setSf(false)}
            user={user} overtimeRequests={overtimeRequests} leaveRequests={leaveRequests} />
        </div>
      )}
      <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
        {isE && (
          <button type="button" onClick={() => setTab("my")} style={{
            padding:"7px 14px", borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:600,
            background: tab === "my" ? theme.pl : theme.card, color: tab === "my" ? "#fff" : theme.ts, border:"none"
          }}>My ({my.length})</button>
        )}
        {!isE && (
          <button type="button" onClick={() => setTab("all")} style={{
            padding:"7px 14px", borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:600,
            background: tab === "all" ? theme.pl : theme.card, color: tab === "all" ? "#fff" : theme.ts, border:"none"
          }}>All ({overtimeRequests.length})</button>
        )}
        {isTL && (
          <button type="button" onClick={() => setTab("pending")} style={{
            padding:"7px 14px", borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:600,
            background: tab === "pending" ? theme.or : theme.card, color: tab === "pending" ? "#fff" : theme.ts, position:"relative", border:"none"
          }}>
            Pending ({pn.length})
            {pn.length > 0 && (
              <span style={{
                position:"absolute", top:-5, right:-5, width:16, height:16, borderRadius:"50%",
                background:theme.rd, color:"#fff", fontSize:9, fontWeight:700,
                display:"flex", alignItems:"center", justifyContent:"center"
              }}>{pn.length}</span>
            )}
          </button>
        )}
      </div>
      {!sh.length
        ? <Empty text="No overtime requests" />
        : sh.map(r => <OtCd key={r.id} req={r} role={user.role} viewerId={user.id} onAct={onAct} />)}
    </div>
  );
}
