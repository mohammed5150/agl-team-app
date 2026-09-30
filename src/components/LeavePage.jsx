import { LEAVE_TYPES, STATUS_LABELS, theme } from "../constants.js";
import { ib, Bt, Bd, SC2, Empty } from "../uiPrimitives.jsx";
import { validateLeaveRequest, remainingBalance, BALANCE_FIELDS } from "../validation.js";
import { rqLabel, RqGrid2, RqAmount, RqFormShell, RqCd, RqHead, RqTabs } from "./requestShared.jsx";
import { Ic } from "./icons.jsx";

const { useState, useMemo } = React;

/* ============================================================
   LEAVE FORM / CARD / PAGE / APPROVALS
   Two-stage workflow: the team lead acts on `pending`, then the
   manager on `tl_approved`. The shared markup lives in
   requestShared.jsx; the rules stay here.
   ============================================================ */

export function LvFm({ onSub, onCan, user, leaveRequests }) {
  const [f, setF] = useState({ type:"Annual Leave", startDate:"", endDate:"", reason:"" });
  const [errors, setErrors] = useState([]);
  const days = f.startDate && f.endDate
    ? Math.max(1, Math.ceil((new Date(f.endDate) - new Date(f.startDate)) / 864e5) + 1)
    : 0;

  // Warnings are computed live so the user sees "this overlaps LR-004" while
  // picking dates, not after pressing Submit. Errors stay on submit, because
  // shouting at a half-typed form is worse than useless.
  const live = useMemo(
    () => validateLeaveRequest(
      { ...f, days },
      { employee: user, requests: leaveRequests }
    ),
    [f, days, user, leaveRequests]
  );
  const balance = remainingBalance(user, f.type);

  const submit = () => {
    const res = validateLeaveRequest({ ...f, days }, { employee: user, requests: leaveRequests });
    if (!res.ok) { setErrors(res.errors); return; }
    setErrors([]);
    onSub({ ...f, days });
  };

  return (
    <RqFormShell title="Apply for Leave" errors={errors} warnings={live.warnings}
      onSubmit={submit} onCancel={onCan}>
      <div style={{ marginBottom:14 }}>
        <label style={rqLabel}>TYPE</label>
        <select value={f.type} onChange={e => setF(p => ({ ...p, type:e.target.value }))}
          style={{ ...ib, background:theme.cs }}>
          {LEAVE_TYPES.map(tp => <option key={tp} value={tp}>{tp}</option>)}
        </select>
        {balance !== null && (
          <div style={{ fontSize:11, color: balance > 0 ? theme.td : theme.yl, marginTop:5 }}>
            {Math.max(0, balance)} days of {BALANCE_FIELDS[f.type].label} remaining
          </div>
        )}
      </div>
      <RqGrid2>
        <div>
          <label style={rqLabel}>START</label>
          <input type="date" value={f.startDate} onChange={e => setF(p => ({ ...p, startDate:e.target.value }))} style={ib} />
        </div>
        <div>
          <label style={rqLabel}>END</label>
          <input type="date" value={f.endDate} onChange={e => setF(p => ({ ...p, endDate:e.target.value }))} style={ib} />
        </div>
      </RqGrid2>
      {days > 0 && <RqAmount>{days} day{days > 1 ? "s" : ""}</RqAmount>}
      <div style={{ marginBottom:18 }}>
        <label style={rqLabel}>REASON</label>
        <textarea value={f.reason} onChange={e => setF(p => ({ ...p, reason:e.target.value }))}
          rows={3} placeholder="Reason..." style={{ ...ib, resize:"vertical", fontFamily:"inherit" }} />
      </div>
    </RqFormShell>
  );
}

export const LvCd = React.memo(function LvCd({ req, role, viewerId, onAct }) {
  // Mirrors lr_update_tl / lr_update_mgr: TL acts on pending, MGR on tl_approved.
  const ca = (role === "teamlead" && req.status === "pending") || (role === "manager" && req.status === "tl_approved");
  return (
    <RqCd req={req} viewerId={viewerId} onAct={onAct} ca={ca}
      statusLabel={STATUS_LABELS[req.status]}
      detail={<>{req.type} • {req.startDate} → {req.endDate} ({req.days}d)</>}
      comments={[["TL", req.tlComment], ["MGR", req.mgrComment]]} />
  );
});

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

  const tabs = [
    ...(isE ? [{ key:"my", label:`My (${my.length})`, accent:theme.pl }] : [
      { key:"all", label:`All (${leaveRequests.length})`, accent:theme.pl },
      { key:"pending", label:`Pending (${pn.length})`, accent:theme.or, badge:pn.length },
    ]),
  ];

  return (
    <div>
      <RqHead title="Leave Management"
        action={isE && <Bt onClick={() => setSf(true)} bg={theme.or}><Ic name="plus" size={14} />Apply</Bt>} />
      {isE && (
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:18 }}>
          <SC2 label="Annual Left" value={user.annualLeave - user.usedAnnual} color={theme.gn} icon={<Ic name="sun" size={44} />} />
          <SC2 label="Sick Left" value={user.sickLeave - user.usedSick} color={theme.rd} icon={<Ic name="cross" size={44} />} />
        </div>
      )}
      {sf && (
        <div style={{ marginBottom:18 }}>
          <LvFm onSub={f => { onSub(f); setSf(false); }} onCan={() => setSf(false)}
            user={user} leaveRequests={leaveRequests} />
        </div>
      )}
      <RqTabs tabs={tabs} tab={tab} setTab={setTab} />
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
        ? <div style={{ textAlign:"center", padding:40, color:theme.td }}><Ic name="check-circle" size={14} style={{ marginRight:6 }} />All clear</div>
        : pn.map(r => <LvCd key={r.id} req={r} role={user.role} viewerId={user.id} onAct={onAct} />)}
    </div>
  );
}
