import { theme } from "../constants.js";
import { ib, Bt } from "../uiPrimitives.jsx";
import { checkPassword, POLICY_SUMMARY } from "../passwordPolicy.js";
import { PasswordRequirements } from "./PasswordRequirements.jsx";
import { GlyphIcon } from "../icons.jsx";

const { useState, useId } = React;

/**
 * Change password.
 *
 * `forced` is set when the user still holds an initial password — app.jsx
 * renders this screen ahead of every route in that case, so it is the only way
 * into the portal.
 *
 * Strength rules come from src/passwordPolicy.js, shared with the first
 * sign-in and reset-link paths. They used to be spelled out here (six
 * characters, one capital, one digit) and nowhere else, which meant the
 * sign-up path — the one that actually SET most passwords — enforced nothing.
 */
export function ChPw({ onCh, forced, onOut, user }) {
  const [o, setO] = useState("");
  const [n, setN] = useState("");
  const [c2, setC2] = useState("");
  const [er, setEr] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const curId = useId();
  const newId = useId();
  const confirmId = useId();

  const identity = { email: user?.email, name: user?.name };

  const submit = async () => {
    if (busy) return;
    setEr("");
    if (!o || !n || !c2) return setEr("Fill all fields");
    if (n === o) return setEr("Your new password must differ from your current one");
    if (n !== c2) return setEr("New passwords don't match");
    const check = checkPassword(n, identity);
    if (!check.ok) return setEr(check.error);

    setBusy(true);
    try {
      const res = await onCh(o, n);
      // onCh returns true, or { ok, error } when it can say what went wrong.
      if (res === true || res?.ok) { setOk(true); return; }
      setEr(res?.error || "Wrong current password");
    } catch (e) {
      console.error("[pw] change failed:", e);
      setEr("Could not change your password. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (ok) return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", height:"100vh", background:theme.bg
    }}>
      <div style={{ marginBottom:12, color:theme.gn }} aria-hidden="true"><GlyphIcon glyph="check-square" size={56} strokeWidth={1.4} /></div>
      <h2 style={{ color:theme.gn, fontSize:20 }}>Password Changed!</h2>
      <p style={{ color:theme.ts, fontSize:13, marginTop:8 }}>Redirecting...</p>
    </div>
  );

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:theme.bg }}>
      <div style={{ maxWidth:420, width:"100%", padding:20 }}>
        <div style={{ background:theme.cs, borderRadius:16, padding:28, border:`1px solid ${theme.bd}` }}>
          <h2 style={{ fontSize:20, fontWeight:700, color:theme.tx, marginBottom:6, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}><GlyphIcon glyph="key" size={19} style={{ color:theme.ol }} /> Change Password</h2>
          {forced && (
            <div style={{
              background:`${theme.or}15`, border:`1px solid ${theme.or}40`,
              borderRadius:10, padding:12, margin:"12px 0 16px", fontSize:13, color:theme.or
            }}><GlyphIcon glyph="alert-triangle" size={13} style={{ verticalAlign:"-2px" }} /> Please change your initial password</div>
          )}
          <p style={{ color:theme.td, fontSize:12, marginBottom:20 }}>{POLICY_SUMMARY}</p>
          {er && (
            <div role="alert" aria-live="assertive" style={{
              background:"rgba(239,68,68,0.1)", borderRadius:10, padding:"8px 12px",
              marginBottom:14, color:theme.rd, fontSize:12
            }}>{er}</div>
          )}
          <form onSubmit={e => { e.preventDefault(); submit(); }} aria-busy={busy}>
            <div style={{ marginBottom:14 }}>
              <label htmlFor={curId} style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>CURRENT</label>
              <input id={curId} name="current-password" type="password" autoComplete="current-password"
                value={o} onChange={e => setO(e.target.value)} style={ib} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label htmlFor={newId} style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>NEW</label>
              <input id={newId} name="new-password" type="password" autoComplete="new-password"
                value={n} onChange={e => setN(e.target.value)} style={ib} />
            </div>
            <PasswordRequirements password={n} identity={identity} />
            <div style={{ marginBottom:20 }}>
              <label htmlFor={confirmId} style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>CONFIRM</label>
              <input id={confirmId} name="confirm-password" type="password" autoComplete="new-password"
                value={c2} onChange={e => setC2(e.target.value)} style={ib} />
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <Bt onClick={submit} bg={theme.or} disabled={busy}>{busy ? "Updating…" : "Update"}</Bt>
              <Bt onClick={onOut} outline={true}>Logout</Bt>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
