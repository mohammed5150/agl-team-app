import { STATUS_COLORS, theme } from "../constants.js";
import { ib, Bd, Bt } from "../uiPrimitives.jsx";

const { useState } = React;

/* ============================================================
   SHARED REQUEST UI
   The leave and overtime pages render the same form scaffolding,
   card, tab row and header; only the fields, the detail line and
   the who-may-act rule differ. The WORKFLOW rules stay in the
   page files — leave is two-stage (TL then MGR), overtime is
   team-lead-terminal — and are passed in as the `ca` prop and the
   tab definitions, never decided here.
   ============================================================ */

// Label style for form fields (TYPE / START / HOURS / REASON ...).
export const rqLabel = { display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 };

// Two-column field grid (START|END, WORK DATE|HOURS).
export function RqGrid2({ children }) {
  return <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>{children}</div>;
}

// The orange "N days" / "N hours" highlight box.
export function RqAmount({ children }) {
  return (
    <div style={{
      background:`${theme.or}15`, borderRadius:8, padding:"8px 12px",
      marginBottom:14, fontSize:13, color:theme.or
    }}>{children}</div>
  );
}

// Form container: title, submit-time errors, the fields (children),
// live warnings, then Submit / Cancel.
export function RqFormShell({ title, errors, warnings, onSubmit, onCancel, children }) {
  return (
    <div style={{ background:theme.cs, borderRadius:14, padding:22, border:`1px solid ${theme.bl}`, maxWidth:520 }}>
      <h3 style={{ fontSize:16, fontWeight:700, color:theme.tx, marginBottom:18 }}>{title}</h3>
      {errors.length > 0 && (
        <div role="alert" aria-live="assertive" style={{
          background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
          borderRadius:8, padding:"8px 12px", marginBottom:12, color:theme.rd, fontSize:12
        }}>
          {errors.map((e, i) => <div key={i} style={{ marginTop: i ? 4 : 0 }}>⚠️ {e}</div>)}
        </div>
      )}
      {children}
      {warnings.length > 0 && (
        <div role="status" aria-live="polite" style={{
          background:`${theme.yl}12`, border:`1px solid ${theme.yl}35`,
          borderRadius:8, padding:"8px 12px", marginBottom:14,
          color:theme.yl, fontSize:12, lineHeight:1.6
        }}>
          {warnings.map((w, i) => <div key={i} style={{ marginTop: i ? 4 : 0 }}>ℹ️ {w}</div>)}
        </div>
      )}
      <div style={{ display:"flex", gap:8 }}>
        <Bt onClick={onSubmit} bg={theme.gn}>📤 Submit</Bt>
        <Bt onClick={onCancel} outline={true}>Cancel</Bt>
      </div>
    </div>
  );
}

/**
 * Request card. `ca` (can act) is the page's workflow rule, passed in
 * already evaluated; `statusLabel` the page's label map entry; `detail`
 * the one-line summary node; `comments` an array of [label, text] pairs
 * rendered only when text is present. Withdrawal is the same rule on
 * both workflows: the requester, while still pending.
 */
export function RqCd({ req, viewerId, onAct, ca, statusLabel, detail, comments }) {
  const [cm, setCm] = useState("");
  const [sa, setSa] = useState(false);
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
        <Bd text={statusLabel} color={STATUS_COLORS[req.status]} />
      </div>
      <div style={{ fontSize:12, marginBottom:8, color:theme.ts }}>{detail}</div>
      <div style={{
        background:theme.ch, borderRadius:8, padding:"8px 10px",
        marginBottom:8, fontSize:12, color:theme.ts
      }}>{req.reason}</div>
      {comments.map(([label, text]) => text && (
        <div key={label} style={{ fontSize:11, marginBottom:4, color:theme.ts }}>
          <strong style={{ color:theme.tx }}>{label}:</strong> {text}
        </div>
      ))}
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

// Page heading with the optional action button (Apply / Claim).
export function RqHead({ title, action }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
      <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, margin:0 }}>{title}</h2>
      {action}
    </div>
  );
}

// Tab row. Each tab: { key, label, accent, badge? } — `accent` is the
// active background, `badge` shows the red pending-count bubble.
export function RqTabs({ tabs, tab, setTab }) {
  return (
    <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
      {tabs.map(t => (
        <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
          padding:"7px 14px", borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:600,
          background: tab === t.key ? t.accent : theme.card, color: tab === t.key ? "#fff" : theme.ts,
          ...(t.badge !== undefined ? { position:"relative" } : {}), border:"none"
        }}>
          {t.label}
          {t.badge > 0 && (
            <span style={{
              position:"absolute", top:-5, right:-5, width:16, height:16, borderRadius:"50%",
              background:theme.rd, color:"#fff", fontSize:9, fontWeight:700,
              display:"flex", alignItems:"center", justifyContent:"center"
            }}>{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
