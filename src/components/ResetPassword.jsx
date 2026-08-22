import { theme } from "../constants.js";
import { ib, Bt, Logo } from "../uiPrimitives.jsx";
import { checkPassword, POLICY_SUMMARY } from "../passwordPolicy.js";
import { PasswordRequirements } from "./PasswordRequirements.jsx";
import { GlyphIcon } from "../icons.jsx";

const { useState, useId } = React;

/**
 * Set a new password from a recovery link.
 *
 * Reached only when Supabase has already established a recovery session from
 * the emailed token — app.jsx renders this ahead of every other screen while
 * that session is live, so the user cannot wander into the portal with a
 * half-finished reset.
 *
 * No current-password field: proving control of the mailbox is what authorises
 * this change, which is the entire point of a reset.
 */
export function ResetPassword({ email, onSubmit, onCancel }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const pwId = useId();
  const confirmId = useId();

  const identity = { email };

  const submit = async () => {
    if (busy) return;
    setError("");
    if (!pw || !confirm) return setError("Fill both fields");
    if (pw !== confirm) return setError("Passwords don't match");
    const check = checkPassword(pw, identity);
    if (!check.ok) return setError(check.error);

    setBusy(true);
    try {
      const res = await onSubmit(pw);
      if (res?.ok) { setDone(true); return; }
      setError(res?.message || "Could not set your new password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center",
      justifyContent:"center", background:theme.bg
    }}>
      <div style={{ width:"100%", maxWidth:420, padding:20 }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:24 }}>
          <Logo size={150} w={true} />
        </div>
        <div style={{
          background:theme.cs, borderRadius:16, padding:28, border:`1px solid ${theme.bd}`
        }}>
          {done ? (
            <div style={{ textAlign:"center" }}>
              <div style={{ marginBottom:10, color:theme.gn }} aria-hidden="true"><GlyphIcon glyph="check-square" size={48} strokeWidth={1.4} /></div>
              <h2 style={{ color:theme.gn, fontSize:19, margin:"0 0 8px" }}>Password updated</h2>
              <p style={{ color:theme.ts, fontSize:13, lineHeight:1.6 }}>
                You are signed in. Taking you to the portal…
              </p>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize:20, fontWeight:700, color:theme.tx, margin:"0 0 6px" }}>
                <GlyphIcon glyph="key" size={17} /> Choose a new password
              </h2>
              {email && (
                <p style={{ color:theme.ts, fontSize:12, margin:"0 0 4px" }}>
                  for <strong style={{ color:theme.tx }}>{email}</strong>
                </p>
              )}
              <p style={{ color:theme.td, fontSize:12, margin:"8px 0 20px" }}>{POLICY_SUMMARY}</p>

              {error && (
                <div role="alert" aria-live="assertive" style={{
                  background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
                  borderRadius:10, padding:"8px 12px", marginBottom:14, color:theme.rd, fontSize:12
                }}><GlyphIcon glyph="alert-triangle" size={13} style={{ verticalAlign:"-2px" }} /> {error}</div>
              )}

              <form onSubmit={e => { e.preventDefault(); submit(); }} aria-busy={busy}>
                <div style={{ marginBottom:14 }}>
                  <label htmlFor={pwId} style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5, letterSpacing:1 }}>NEW PASSWORD</label>
                  <input id={pwId} name="new-password" type="password" autoComplete="new-password"
                    value={pw} onChange={e => setPw(e.target.value)} style={ib} />
                </div>
                <PasswordRequirements password={pw} identity={identity} />
                <div style={{ marginBottom:20 }}>
                  <label htmlFor={confirmId} style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5, letterSpacing:1 }}>CONFIRM PASSWORD</label>
                  <input id={confirmId} name="confirm-password" type="password" autoComplete="new-password"
                    value={confirm} onChange={e => setConfirm(e.target.value)} style={ib} />
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <Bt onClick={submit} bg={theme.or} disabled={busy}>
                    {busy ? "Saving…" : "Set password"}
                  </Bt>
                  <Bt onClick={onCancel} outline={true}>Cancel</Bt>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
