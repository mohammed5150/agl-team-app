import { theme } from "./constants.js";
import { GlyphIcon } from "./icons.jsx";

const { useId, useRef, useEffect } = React;

export const Logo = ({ size=120, w=true }) => (
  <svg viewBox="0 0 280 210" width={size} height={size*210/280} xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(140, 8)" fill="#E8702A">
      <path d="M0,0 L5,10 L5,28 L40,46 L40,52 L5,46 L5,64 L16,74 L16,78 L0,73 L-16,78 L-16,74 L-5,64 L-5,46 L-40,52 L-40,46 L-5,28 L-5,10 Z"/>
    </g>
    <text x="140" y="140" textAnchor="middle" fontFamily="'Arial Black',Impact,sans-serif" fontSize="42" fontWeight="900" fill={w?"#fff":"#1b4d62"} letterSpacing="3">ADB</text>
    <text x="140" y="190" textAnchor="middle" fontFamily="'Arial Black',Impact,sans-serif" fontSize="42" fontWeight="900" fill={w?"#fff":"#1b4d62"} letterSpacing="3">SAFEGATE</text>
  </svg>
);

// fontSize is 16, not 13, on purpose. iOS Safari auto-zooms the viewport when
// a focused input's font-size is below 16px, which on a phone leaves the user
// zoomed into a form field with the rest of the layout off-screen. 16px is the
// threshold that stops it; there is no way to opt out that also allows pinch
// zoom, and the viewport meta here deliberately keeps pinch zoom enabled.
export const ib = {
  width:"100%", padding:"10px 14px", borderRadius:theme.r.ctl,
  border:`1px solid ${theme.bl}`, background:"rgba(255,255,255,0.05)",
  color:theme.tx, fontSize:16, outline:"none", boxSizing:"border-box"
};

export const Bd = ({ text, color }) => (
  <span style={{
    padding:"4px 12px", borderRadius:20, fontSize:10, fontWeight:700,
    background:`${color}18`, color, border:`1px solid ${color}30`, whiteSpace:"nowrap"
  }}>{text}</span>
);

// `type` defaults to "button", NOT to the HTML default of "submit".
//
// A <button> with no type inside a <form> submits it. Bt is used everywhere,
// including inside the reset-password and change-password forms, and that
// caused two distinct faults on the two screens people reach when they are
// already locked out:
//
//   * "Cancel" (and "Logout") submitted the form on their way out, so the
//     handler they were trying to escape ran anyway.
//   * The primary button ran its work TWICE — once from onClick, once from the
//     form's onSubmit. The `if (busy) return` guard cannot catch it: both fire
//     in the same tick, before setBusy(true) has applied. So a password reset
//     sent updateUser twice, and the second call could come back "should be
//     different from the old password" — an error reported for a reset that
//     had in fact just succeeded.
//
// Enter-to-submit still works: that goes through the form's onSubmit, which is
// exactly what it is for.
export const Bt = ({ children, onClick, bg=theme.pl, color="#fff", outline=false, small=false, disabled=false, type="button" }) => (
  <button type={type} onClick={onClick} disabled={disabled} style={{
    padding: small ? "6px 14px" : "10px 20px",
    // minHeight, not extra padding, so the hit area reaches 44px without the
    // button visually growing much. 44px is the iOS HIG / WCAG 2.5.5 target
    // size; `small` buttons were ~26px, which is fine for a mouse but not for
    // a thumb — and these are Approve / Reject / Withdraw actions used on a
    // phone out on the airfield.
    minHeight:44,
    display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6,
    borderRadius:theme.r.ctl,
    border: outline ? `1px solid ${theme.bl}` : "none",
    background: disabled ? "rgba(255,255,255,0.05)" : (outline ? "transparent" : bg),
    color: disabled ? theme.td : (outline ? theme.ts : color),
    fontSize: small ? 12 : 13,
    fontWeight:600,
    cursor: disabled ? "not-allowed" : "pointer"
  }}>{children}</button>
);

export const SC2 = ({ label, value, color, icon, sub }) => (
  <div style={{
    background:theme.card, borderRadius:theme.r.card, padding:"18px 16px",
    flex:"1 1 150px", border:`1px solid ${theme.bd}`, minWidth:140,
    position:"relative", overflow:"hidden"
  }}>
    <div style={{ position:"absolute", top:-8, right:-8, opacity:0.07, color:theme.tx }}>
      <GlyphIcon glyph={icon} size={64} strokeWidth={1.2} />
    </div>
    <div style={{ fontSize:13, color:theme.td, marginBottom:6, fontWeight:500 }}>{label}</div>
    <div style={{ fontSize:28, fontWeight:800, color }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:theme.td, marginTop:4 }}>{sub}</div>}
  </div>
);

export const Sec = ({ title, icon, children, action }) => (
  <div style={{ background:theme.card, borderRadius:theme.r.card, padding:22, marginBottom:18, border:`1px solid ${theme.bd}` }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
      <h3 style={{ fontSize:15, fontWeight:700, color:theme.tx, display:"flex", alignItems:"center", gap:8, margin:0 }}>
        {icon && <span style={{ color:theme.ol, display:"inline-flex" }}><GlyphIcon glyph={icon} size={17} /></span>}
        {title}
      </h3>
      {action}
    </div>
    {children}
  </div>
);

export const Fd = ({ label, value, editing, onChange, type="text" }) => {
  const inputId = useId();
  return (
    <div style={{ marginBottom:14 }}>
      <label htmlFor={editing ? inputId : undefined} style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5, letterSpacing:1, textTransform:"uppercase" }}>{label}</label>
      {editing
        ? <input id={inputId} type={type} value={value || ""} onChange={e=>onChange(e.target.value)}
            style={{...ib, borderColor:theme.or, background:"rgba(255,255,255,0.08)"}} />
        : <div style={{...ib, background:"transparent", borderColor:theme.bd}}>{value || "—"}</div>}
    </div>
  );
};

export const Modal = ({ title, onClose, children, width=560 }) => {
  const titleId = useId();
  const panelRef = useRef(null);
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      className="modal-bg"
      style={{
        position:"fixed", inset:0, background:"rgba(0,0,0,0.6)",
        backdropFilter:"blur(4px)", zIndex:1000, display:"flex",
        alignItems:"center", justifyContent:"center", padding:20
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={e=>e.stopPropagation()}
        className="modal-panel"
        style={{
        background:theme.cs, borderRadius:theme.r.panel, padding:24, border:`1px solid ${theme.bl}`,
        width:"100%", maxWidth:width, maxHeight:"90vh", overflowY:"auto",
        boxShadow:"0 24px 80px rgba(0,0,0,0.5)", outline:"none"
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <h3 id={titleId} style={{ fontSize:17, fontWeight:700, color:theme.tx, margin:0 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close dialog" style={{
            background:"none", border:"none", color:theme.td,
            fontSize:22, cursor:"pointer", padding:4, lineHeight:1
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const Empty = ({ icon="inbox", text="No records yet" }) => (
  <div style={{ textAlign:"center", padding:"30px 16px", color:theme.td }}>
    <div style={{ marginBottom:8, opacity:0.6 }}><GlyphIcon glyph={icon} size={32} strokeWidth={1.4} /></div>
    <div style={{ fontSize:13 }}>{text}</div>
  </div>
);
