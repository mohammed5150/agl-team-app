import { OT_STATUS_LABELS, theme } from "../constants.js";
import { approvedHours } from "../overtimeWorkflow.js";
import { ib, Bt, SC2, Empty } from "../uiPrimitives.jsx";
import { validateOvertimeRequest, claimedHoursOn } from "../validation.js";
import { rqLabel, RqGrid2, RqAmount, RqFormShell, RqCd, RqHead, RqTabs } from "./requestShared.jsx";

const { useState, useMemo } = React;

/* ============================================================
   OVERTIME FORM / CARD / PAGE
   Team-lead-terminal: a manager can view overtime but never
   approves it, so no manager tab or action controls exist here.
   The shared markup lives in requestShared.jsx; the rules stay
   here.
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
    <RqFormShell title="⏰ Claim Overtime" errors={errors} warnings={live.warnings}
      onSubmit={submit} onCancel={onCan}>
      <RqGrid2>
        <div>
          <label style={rqLabel}>WORK DATE</label>
          <input type="date" value={f.workDate}
            onChange={e => setF(p => ({ ...p, workDate:e.target.value }))} style={ib} />
        </div>
        <div>
          <label style={rqLabel}>HOURS</label>
          <input type="number" min="0.5" max="12" step="0.5" value={f.hours}
            onChange={e => setF(p => ({ ...p, hours:e.target.value }))} placeholder="e.g. 3.5" style={ib} />
        </div>
      </RqGrid2>
      {hours > 0 && (
        <RqAmount>
          {hours} hour{hours === 1 ? "" : "s"} — approved by your team lead
          {already > 0 && <> · {already}h already claimed on this date</>}
        </RqAmount>
      )}
      <div style={{ marginBottom:18 }}>
        <label style={rqLabel}>REASON</label>
        <textarea value={f.reason} onChange={e => setF(p => ({ ...p, reason:e.target.value }))}
          rows={3} placeholder="What was the work?" style={{ ...ib, resize:"vertical", fontFamily:"inherit" }} />
      </div>
    </RqFormShell>
  );
}

export const OtCd = React.memo(function OtCd({ req, role, viewerId, onAct }) {
  // Only a team lead acts, and only while pending. Managers get no controls
  // (overtime is team-lead-terminal — see supabase_overtime_bands.sql).
  const ca = role === "teamlead" && req.status === "pending";
  return (
    <RqCd req={req} viewerId={viewerId} onAct={onAct} ca={ca}
      statusLabel={OT_STATUS_LABELS[req.status]}
      detail={<>{req.workDate} • <strong style={{ color:theme.or }}>{req.hours}h</strong></>}
      comments={[["TL", req.tlComment]]} />
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

  const tabs = [
    ...(isE ? [{ key:"my", label:`My (${my.length})`, accent:theme.pl }] : [
      { key:"all", label:`All (${overtimeRequests.length})`, accent:theme.pl },
    ]),
    ...(isTL ? [{ key:"pending", label:`Pending (${pn.length})`, accent:theme.or, badge:pn.length }] : []),
  ];

  return (
    <div>
      <RqHead title="Overtime"
        action={isE && <Bt onClick={() => setSf(true)} bg={theme.or}>⏰ Claim</Bt>} />
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
      <RqTabs tabs={tabs} tab={tab} setTab={setTab} />
      {!sh.length
        ? <Empty text="No overtime requests" />
        : sh.map(r => <OtCd key={r.id} req={r} role={user.role} viewerId={user.id} onAct={onAct} />)}
    </div>
  );
}
