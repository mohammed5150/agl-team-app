import { theme } from "./constants.js";
import { Logo, ib } from "./uiPrimitives.jsx";
import { GlyphIcon } from "./icons.jsx";
import { POLICY_SUMMARY } from "./passwordPolicy.js";

const { useId, useState } = React;

/**
 * Password-reset request, shown in place of the sign-in form.
 *
 * The outcome message is deliberately identical whether or not the address has
 * an account (see requestPasswordReset in src/authFlows.js) — the one thing
 * this form must not become is a way to find out who is registered.
 */
function ForgotPassword({ initialEmail, onRequest, onBack }) {
  const [email, setEmail] = useState(initialEmail || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const emailId = useId();

  const submit = async () => {
    if (busy) return;
    setError(""); setNotice("");
    setBusy(true);
    try {
      const r = await onRequest(email);
      if (r.ok) setNotice(r.message);
      else setError(r.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 style={{ color:theme.tx, fontSize:17, fontWeight:700, marginBottom:8, textAlign:"center" }}>
        Reset your password
      </h2>
      <p style={{ color:theme.td, fontSize:12, lineHeight:1.6, marginBottom:18, textAlign:"center" }}>
        Enter your Team Mail ID and we'll email you a link to set a new password.
      </p>

      {error && (
        <div role="alert" aria-live="assertive" style={{
          background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
          borderRadius:10, padding:"8px 12px", marginBottom:14, color:theme.rd, fontSize:12
        }}><GlyphIcon glyph="alert-triangle" size={13} style={{ verticalAlign:"-2px" }} /> {error}</div>
      )}
      {notice && (
        <div role="status" aria-live="polite" style={{
          background:"rgba(16,185,129,0.1)", border:"1px solid rgba(16,185,129,0.3)",
          borderRadius:10, padding:"10px 12px", marginBottom:14, color:theme.gn,
          fontSize:12, lineHeight:1.6
        }}><GlyphIcon glyph="mail" size={13} style={{ verticalAlign:"-2px" }} /> {notice}</div>
      )}

      <form onSubmit={e => { e.preventDefault(); submit(); }} aria-busy={busy}>
        <div style={{ marginBottom:18 }}>
          <label htmlFor={emailId} style={{ display:"block", color:theme.td, fontSize:10, fontWeight:700, marginBottom:5, letterSpacing:1 }}>EMAIL ADDRESS</label>
          <input
            id={emailId} name="email" type="email" autoComplete="username"
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="your.name@adbsafegate.com"
            style={ib}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          style={{
            width:"100%", padding:"12px", borderRadius:10, border:"none",
            background:theme.ga, color:"#fff", fontSize:14, fontWeight:700,
            cursor: busy ? "wait" : "pointer", opacity: busy ? 0.75 : 1,
            boxShadow:"0 4px 20px rgba(232,112,42,0.3)"
          }}
        >{busy ? "Sending…" : "Email me a reset link"}</button>
      </form>

      <div style={{ textAlign:"center", marginTop:16 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background:"none", border:"none", color:theme.bu,
            fontSize:12, cursor:"pointer", padding:4, textDecoration:"underline"
          }}
        >← Back to sign in</button>
      </div>
    </>
  );
}

/** Gated off in production builds when SHOW_DEMO_LOGIN=false (see build.js). */
export function LoginPage({
  loginId, loginPassword, loginError, loginSubmitting,
  setLoginId, setLoginPassword, login, onRequestReset,
}) {
  const emailId = useId();
  const passwordId = useId();
  const [mode, setMode] = useState("signin"); // "signin" | "forgot"
  const [showPassword, setShowPassword] = useState(false);
  // The password-rules paragraph only matters once someone is choosing a
  // password; revealing it on focus keeps the resting screen quiet.
  const [passwordTouched, setPasswordTouched] = useState(false);
  // __SHOW_DEMO__ is a compile-time define (build.js / npm run dev). Using it
  // directly (not via a variable) lets esbuild fold the condition and strip
  // every demo credential string out of production bundles entirely.
  // Local-dev convenience only: prefills the email field for each role so a
  // developer does not have to retype it. No password is carried here — every
  // account, including these, sets its own via Supabase Auth. Compiled out of
  // production builds by the __SHOW_DEMO__ define (build.js).
  const demoAccounts = (typeof __SHOW_DEMO__ !== "undefined" ? __SHOW_DEMO__ : true) ? [
    { id:"amarnath.munderi@adbsafegate.com", l:"Employee (Amarnath)", i:"hard-hat" },
    { id:"mohammed.faheem@adbsafegate.com", l:"Team Leader (Faheem)", i:"users" },
    { id:"ragesh.menon@adbsafegate.com", l:"Manager (Ragesh)", i:"briefcase" }
  ] : [];

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:theme.bg }}>
      <div style={{
        position:"absolute", inset:0,
        background:"radial-gradient(ellipse at 20% 50%,rgba(21,66,95,0.3) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(232,112,42,0.1) 0%,transparent 50%)"
      }}/>
      <div className="runway" aria-hidden="true">
        <div className="runway-plane" />
        <div className="runway-threshold" />
      </div>
      <div style={{ width:"100%", maxWidth:400, padding:20, position:"relative", zIndex:1 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ margin:"0 auto 16px", display:"flex", justifyContent:"center" }}>
            <Logo size={260} />
          </div>
          <p style={{ color:theme.or, fontSize:12, fontWeight:700, letterSpacing:2 }}>ABU DHABI MAINTENANCE TEAM</p>
        </div>
        <div style={{
          background:"rgba(17,31,48,0.8)", backdropFilter:"blur(20px)",
          borderRadius:18, padding:28, border:`1px solid ${theme.bl}`,
          boxShadow:"0 24px 80px rgba(0,0,0,0.5)"
        }}>
          {mode === "forgot" ? (
            <ForgotPassword
              initialEmail={loginId}
              onRequest={onRequestReset}
              onBack={() => setMode("signin")}
            />
          ) : (
          <>
          <h2 style={{ color:theme.tx, fontSize:17, fontWeight:700, marginBottom:20, textAlign:"center" }}>Sign In to Portal</h2>
          {loginError && (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
                borderRadius:10, padding:"8px 12px", marginBottom:14, color:theme.rd, fontSize:12
              }}
            ><GlyphIcon glyph="alert-triangle" size={13} style={{ verticalAlign:"-2px" }} /> {loginError}</div>
          )}
          <form
            onSubmit={e => { e.preventDefault(); if (!loginSubmitting) login(); }}
            aria-busy={loginSubmitting}
          >
            <div style={{ marginBottom:16 }}>
              <label htmlFor={emailId} style={{ display:"block", color:theme.td, fontSize:10, fontWeight:700, marginBottom:5, letterSpacing:1 }}>EMAIL ADDRESS</label>
              <input
                id={emailId}
                name="email"
                type="email"
                autoComplete="username"
                value={loginId}
                onChange={e => setLoginId(e.target.value)}
                placeholder="your.name@adbsafegate.com"
                style={ib}
              />
            </div>
            <div style={{ marginBottom:22 }}>
              <label htmlFor={passwordId} style={{ display:"block", color:theme.td, fontSize:10, fontWeight:700, marginBottom:5, letterSpacing:1 }}>PASSWORD</label>
              <div style={{ position:"relative" }}>
                <input
                  id={passwordId}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  onFocus={() => setPasswordTouched(true)}
                  placeholder="Enter password"
                  style={{ ...ib, paddingRight:46 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  style={{
                    position:"absolute", right:4, top:"50%", transform:"translateY(-50%)",
                    background:"none", border:"none", cursor:"pointer", padding:"0 10px",
                    color:theme.ts, display:"inline-flex", alignItems:"center"
                  }}
                >
                  <GlyphIcon glyph={showPassword ? "eye-off" : "eye"} size={18} />
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loginSubmitting}
              style={{
                width:"100%", padding:"12px", borderRadius:10, border:"none",
                background:theme.ga, color:"#fff", fontSize:14, fontWeight:700, cursor: loginSubmitting ? "wait" : "pointer",
                opacity: loginSubmitting ? 0.75 : 1,
                boxShadow:"0 4px 20px rgba(232,112,42,0.3)"
              }}
            >{loginSubmitting ? "Signing in…" : "Sign In"}</button>
          </form>
          <div style={{ textAlign:"center", marginTop:12 }}>
            <button
              type="button"
              onClick={() => setMode("forgot")}
              style={{
                background:"none", border:"none", color:theme.bu,
                fontSize:12, cursor:"pointer", padding:4, textDecoration:"underline"
              }}
            >Forgot your password?</button>
          </div>
          <div style={{ textAlign:"center", marginTop:8, fontSize:11, color:theme.td, lineHeight:1.6 }}>
            Sign in with your Team Mail ID. First time here? Enter your team email
            and choose your own password — it becomes your permanent password.
            {passwordTouched && <div className="fade-in" style={{ marginTop:6, color:theme.td }}>{POLICY_SUMMARY}</div>}
          </div>
          </>
          )}
        </div>
        {(typeof __SHOW_DEMO__ !== "undefined" ? __SHOW_DEMO__ : true) && (
        <div style={{
          marginTop:18, background:"rgba(17,31,48,0.6)", borderRadius:12,
          padding:14, border:`1px solid ${theme.bd}`
        }}>
          <p style={{ color:theme.td, fontSize:10, fontWeight:700, letterSpacing:1, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
            <GlyphIcon glyph="user" size={12} /> DEV: PREFILL EMAIL
          </p>
          {demoAccounts.map(a => (
            <div key={a.id} className="row-hover" onClick={() => setLoginId(a.id)} style={{
              display:"flex", justifyContent:"space-between", alignItems:"center", gap:8,
              padding:"7px 8px", borderRadius:8, cursor:"pointer", fontSize:12
            }}>
              <span style={{ color:theme.ts, display:"inline-flex", alignItems:"center", gap:7 }}>
                <GlyphIcon glyph={a.i} size={14} /> {a.l}
              </span>
              <span style={{ color:theme.ol, fontFamily:"monospace", fontSize:10 }}>{a.id}</span>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
