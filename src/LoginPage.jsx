import { theme } from "./constants.js";
import { Logo, ib } from "./uiPrimitives.jsx";

const { useId } = React;

/** Gated off in production builds when SHOW_DEMO_LOGIN=false (see build.js). */
export function LoginPage({
  loginId, loginPassword, loginError, loginSubmitting,
  setLoginId, setLoginPassword, login,
}) {
  const emailId = useId();
  const passwordId = useId();
  // __SHOW_DEMO__ is a compile-time define (build.js / npm run dev). Using it
  // directly (not via a variable) lets esbuild fold the condition and strip
  // every demo credential string out of production bundles entirely.
  // Local-dev convenience only: prefills the email field for each role so a
  // developer does not have to retype it. No password is carried here — every
  // account, including these, sets its own via Supabase Auth. Compiled out of
  // production builds by the __SHOW_DEMO__ define (build.js).
  const demoAccounts = (typeof __SHOW_DEMO__ !== "undefined" ? __SHOW_DEMO__ : true) ? [
    { id:"amarnath.munderi@adbsafegate.com", l:"Employee (Amarnath)", i:"👷" },
    { id:"mohammed.faheem@adbsafegate.com", l:"Team Leader (Faheem)", i:"👨‍💼" },
    { id:"ragesh.menon@adbsafegate.com", l:"Manager (Ragesh)", i:"👔" }
  ] : [];

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:theme.bg }}>
      <div style={{
        position:"absolute", inset:0,
        background:"radial-gradient(ellipse at 20% 50%,rgba(21,66,95,0.3) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(232,112,42,0.1) 0%,transparent 50%)"
      }}/>
      <div style={{ width:"100%", maxWidth:400, padding:20, position:"relative", zIndex:1 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ margin:"0 auto 16px", display:"flex", justifyContent:"center" }}>
            <Logo size={180} w={true} />
          </div>
          <p style={{ color:theme.or, fontSize:12, fontWeight:700, letterSpacing:2 }}>ABU DHABI MAINTENANCE TEAM</p>
        </div>
        <div style={{
          background:"rgba(17,31,48,0.8)", backdropFilter:"blur(20px)",
          borderRadius:18, padding:28, border:`1px solid ${theme.bl}`,
          boxShadow:"0 24px 80px rgba(0,0,0,0.5)"
        }}>
          <h2 style={{ color:theme.tx, fontSize:17, fontWeight:700, marginBottom:20, textAlign:"center" }}>Sign In to Portal</h2>
          {loginError && (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
                borderRadius:10, padding:"8px 12px", marginBottom:14, color:theme.rd, fontSize:12
              }}
            >⚠️ {loginError}</div>
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
              <input
                id={passwordId}
                name="password"
                type="password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="Enter password"
                style={ib}
              />
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
          <div style={{ textAlign:"center", marginTop:14, fontSize:11, color:theme.td, lineHeight:1.6 }}>
            Sign in with your Team Mail ID. First time here? Enter your team email
            and choose your own password — it becomes your permanent password.
          </div>
        </div>
        {(typeof __SHOW_DEMO__ !== "undefined" ? __SHOW_DEMO__ : true) && (
        <div style={{
          marginTop:18, background:"rgba(17,31,48,0.6)", borderRadius:12,
          padding:14, border:`1px solid ${theme.bd}`
        }}>
          <p style={{ color:theme.td, fontSize:10, fontWeight:700, letterSpacing:1, marginBottom:8 }}>👤 DEV: PREFILL EMAIL</p>
          {demoAccounts.map(a => (
            <div key={a.id} onClick={() => setLoginId(a.id)} style={{
              display:"flex", justifyContent:"space-between", padding:"7px 8px",
              borderRadius:8, cursor:"pointer", fontSize:12
            }}>
              <span style={{ color:theme.ts }}>{a.i} {a.l}</span>
              <span style={{ color:theme.or, fontFamily:"monospace", fontSize:9 }}>{a.id}</span>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
