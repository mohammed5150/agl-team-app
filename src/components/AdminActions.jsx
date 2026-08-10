import { theme } from "../constants.js";
import { Bt, Bd, Sec, Modal, ib } from "../uiPrimitives.jsx";
import { canResetOthersPassword, canOffboardEmployee } from "../authz.js";

const { useState, useId } = React;

export const STATUS_META = {
  active:     { label: "Active",     color: theme.gn },
  suspended:  { label: "Suspended",  color: theme.yl },
  offboarded: { label: "Offboarded", color: theme.td },
};

/** Badge for an account that is not active. Renders nothing for an active one. */
export function EmploymentBadge({ employee }) {
  const status = employee?.employmentStatus || "active";
  if (status === "active") return null;
  const meta = STATUS_META[status] || STATUS_META.offboarded;
  return <Bd text={meta.label} color={meta.color} />;
}

/**
 * Manager-only account actions on another employee's profile.
 *
 * These are the two things a manager previously had to open the Supabase
 * dashboard for — resetting a locked-out member's password, and removing
 * someone who has left. Doing them by hand meant no audit entry, no
 * validation, and in the second case a DELETE that took the person's leave
 * history and ratings with it.
 *
 * Both are gated here and, more importantly, in the database:
 * guard_employment_status refuses a status change from a non-manager, and the
 * reset goes through the same public endpoint the user could have used
 * themselves — the service_role key needed for the admin API must never reach
 * a browser.
 */
export function AdminActions({ employee, actor, onSendReset, onSetEmploymentStatus }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null); // target status | null
  const [reason, setReason] = useState("");
  const reasonId = useId();

  const mayReset    = canResetOthersPassword(actor);
  const mayOffboard = canOffboardEmployee(actor);
  if (!mayReset && !mayOffboard) return null;
  // Acting on your own row here makes no sense: a manager resets their own
  // password from Settings, and cannot be the one to offboard themselves.
  if (actor?.id === employee?.id) return null;

  const status = employee.employmentStatus || "active";
  const meta = STATUS_META[status] || STATUS_META.active;

  const run = async (fn) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fn();
      if (res?.ok) setNotice(res.message || "Done");
      else setError(res?.message || "That didn't work");
    } catch (e) {
      console.error("[admin] action failed:", e);
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const applyStatus = async (next) => {
    setConfirming(null);
    await run(() => onSetEmploymentStatus(employee, next, reason.trim()));
    setReason("");
  };

  return (
    <Sec title="Account" icon="🔧">
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        <span style={{ color:theme.td, fontSize:12 }}>Status</span>
        <Bd text={meta.label} color={meta.color} />
        {employee.offboardedAt && (
          <span style={{ color:theme.td, fontSize:11 }}>
            since {new Date(employee.offboardedAt).toLocaleDateString("en-GB")}
          </span>
        )}
      </div>

      {notice && (
        <div role="status" aria-live="polite" style={{
          background:"rgba(16,185,129,0.1)", border:"1px solid rgba(16,185,129,0.3)",
          borderRadius:10, padding:"8px 12px", marginBottom:12, color:theme.gn, fontSize:12,
        }}>✓ {notice}</div>
      )}
      {error && (
        <div role="alert" aria-live="assertive" style={{
          background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
          borderRadius:10, padding:"8px 12px", marginBottom:12, color:theme.rd, fontSize:12,
        }}>⚠️ {error}</div>
      )}

      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {mayReset && (
          <Bt small={true} outline={true} disabled={busy || !employee.email}
            onClick={() => run(() => onSendReset(employee))}>
            ✉️ Send password reset
          </Bt>
        )}
        {mayOffboard && status === "active" && (
          <>
            <Bt small={true} bg={theme.yl} disabled={busy}
              onClick={() => setConfirming("suspended")}>⏸ Suspend</Bt>
            <Bt small={true} bg={theme.rd} disabled={busy}
              onClick={() => setConfirming("offboarded")}>👋 Offboard</Bt>
          </>
        )}
        {mayOffboard && status !== "active" && (
          <Bt small={true} bg={theme.gn} disabled={busy}
            onClick={() => setConfirming("active")}>↩ Reactivate</Bt>
        )}
      </div>

      <p style={{ color:theme.td, fontSize:11, marginTop:12, lineHeight:1.6 }}>
        Offboarding deactivates the account — it does not delete anything. Leave
        history, ratings and the audit trail stay intact and stay linked to this
        person. A suspended or offboarded account cannot file new leave or
        overtime, but the record remains readable.
      </p>

      {confirming && (
        <Modal
          title={
            confirming === "offboarded" ? `Offboard ${employee.name}?`
            : confirming === "suspended" ? `Suspend ${employee.name}?`
            : `Reactivate ${employee.name}?`
          }
          onClose={() => { setConfirming(null); setReason(""); }}
          width={460}
        >
          <p style={{ color:theme.ts, fontSize:13, lineHeight:1.6, margin:"0 0 14px" }}>
            {confirming === "active"
              ? "They will be able to sign in and file requests again."
              : "They keep their record and their history. They will not be able to "
                + "file new leave or overtime, and their existing requests stay as they are."}
          </p>

          <label htmlFor={reasonId} style={{
            display:"block", fontSize:10, color:theme.td,
            fontWeight:700, marginBottom:5, letterSpacing:1,
          }}>REASON (recorded in the audit trail)</label>
          <input
            id={reasonId}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={confirming === "active" ? "e.g. returned from unpaid leave" : "e.g. end of contract, 31 Aug 2026"}
            style={ib}
          />

          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:18 }}>
            <Bt onClick={() => { setConfirming(null); setReason(""); }} outline={true}>Cancel</Bt>
            <Bt
              onClick={() => applyStatus(confirming)}
              bg={confirming === "active" ? theme.gn : confirming === "suspended" ? theme.yl : theme.rd}
              disabled={busy}
            >
              {confirming === "offboarded" ? "Offboard"
                : confirming === "suspended" ? "Suspend" : "Reactivate"}
            </Bt>
          </div>
        </Modal>
      )}
    </Sec>
  );
}
