import { theme } from "../constants.js";
import { ib, Bt } from "../uiPrimitives.jsx";

const { useState } = React;

export function ChPw({ onCh, forced, onOut }) {
  const [o, setO] = useState("");
  const [n, setN] = useState("");
  const [c2, setC2] = useState("");
  const [er, setEr] = useState("");
  const [ok, setOk] = useState(false);

  const submit = async () => {
    setEr("");
    if (!o || !n || !c2) return setEr("Fill all fields");
    if (n.length < 6) return setEr("Min 6 characters");
    if (n === o) return setEr("Must differ from current");
    if (n !== c2) return setEr("New passwords don't match");
    if (!/[A-Z]/.test(n) || !/[0-9]/.test(n)) return setEr("Need 1 uppercase + 1 number");
    const ok2 = await onCh(o, n);
    if (!ok2) return setEr("Wrong current password");
    setOk(true);
  };

  if (ok) return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", height:"100vh", background:theme.bg
    }}>
      <div style={{ fontSize:56, marginBottom:12 }}>✅</div>
      <h2 style={{ color:theme.gn, fontSize:20 }}>Password Changed!</h2>
      <p style={{ color:theme.ts, fontSize:13, marginTop:8 }}>Redirecting...</p>
    </div>
  );

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:theme.bg }}>
      <div style={{ maxWidth:420, width:"100%", padding:20 }}>
        <div style={{ background:theme.cs, borderRadius:16, padding:28, border:`1px solid ${theme.bd}` }}>
          <h2 style={{ fontSize:20, fontWeight:700, color:theme.tx, marginBottom:6 }}>🔐 Change Password</h2>
          {forced && (
            <div style={{
              background:`${theme.or}15`, border:`1px solid ${theme.or}40`,
              borderRadius:10, padding:12, margin:"12px 0 16px", fontSize:13, color:theme.or
            }}>⚠️ Please change your initial password</div>
          )}
          <p style={{ color:theme.td, fontSize:12, marginBottom:20 }}>Min 6 chars, 1 uppercase, 1 number</p>
          {er && (
            <div style={{
              background:"rgba(239,68,68,0.1)", borderRadius:10, padding:"8px 12px",
              marginBottom:14, color:theme.rd, fontSize:12
            }}>{er}</div>
          )}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>CURRENT</label>
            <input type="password" value={o} onChange={e => setO(e.target.value)} style={ib} />
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>NEW</label>
            <input type="password" value={n} onChange={e => setN(e.target.value)} style={ib} />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>CONFIRM</label>
            <input type="password" value={c2} onChange={e => setC2(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()} style={ib} />
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Bt onClick={submit} bg={theme.or}>Update</Bt>
            <Bt onClick={onOut} outline={true}>Logout</Bt>
          </div>
        </div>
      </div>
    </div>
  );
}

