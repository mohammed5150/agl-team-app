
import { theme } from "../constants.js";

// Pastel palette for the new dashboard cards
export const PASTEL = { coral:"#f5a99a", mint:"#a8e5c5", lilac:"#b9a8f2", butter:"#f5e892", sky:"#a8d4f5" };
export const INK = "#0b1a2b";

// Circular progress ring — value is 0..1
export const Ring = ({ value, size=120, stroke=10, color="#0b1a2b", track="rgba(0,0,0,0.12)", label, sub }) => {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div style={{ position:"relative", width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          style={{ transition:"stroke-dashoffset .6s ease" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontSize:28, fontWeight:800, color:INK, lineHeight:1, fontVariantNumeric:"tabular-nums" }}>{label}</div>
        {sub && <div style={{ fontSize:10, fontWeight:700, color:INK, opacity:0.7, marginTop:2, letterSpacing:0.4 }}>{sub}</div>}
      </div>
    </div>
  );
};

// Twelve-month mini bar chart (one value per calendar month). Zero months
// draw as a 2px baseline tick, never a fake minimum bar; `active` marks the
// current month at full ink while the rest sit at 60%. Each bar carries a
// native title tooltip ("March — 2 days").
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const MonthBars = ({ values, color=INK, height=42, active=-1, unit="day" }) => {
  const max = Math.max(1, ...values);
  return (
    <div role="img" aria-label={MONTH_NAMES.map((m, i) => `${m}: ${values[i] || 0}`).join(", ")}>
      <div style={{ display:"flex", alignItems:"flex-end", gap:2, height, borderBottom:`1px solid ${color}40` }}>
        {values.map((v, i) => (
          <div key={i} title={`${MONTH_NAMES[i]} — ${v} ${unit}${v === 1 ? "" : "s"}`}
            style={{ flex:1, display:"flex", alignItems:"flex-end", height:"100%" }}>
            <div style={{
              width:"100%", maxWidth:18, margin:"0 auto",
              height: v > 0 ? `${Math.round((v/max)*height)}px` : "2px",
              background: v > 0 ? (i === active ? color : `${color}99`) : `${color}40`,
              borderRadius:"2px 2px 0 0",
            }} />
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:2, marginTop:4 }}>
        {MONTH_NAMES.map((m, i) => (
          <span key={m} style={{
            flex:1, textAlign:"center", fontSize:8, fontWeight: i === active ? 800 : 600,
            opacity: i === active ? 1 : 0.55, letterSpacing:0.3,
          }}>{m[0]}</span>
        ))}
      </div>
    </div>
  );
};

// Small square tile in the new aesthetic
export const Tile = ({ bg, label, value, sub, dark=false, children, onClick }) => {
  const fg = dark ? "#f0f4f8" : INK;
  return (
    <div onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }) : undefined}
      style={{
      background: bg, borderRadius:theme.r.hero, padding:18,
      minHeight:150, cursor: onClick ? "pointer" : "default",
      display:"flex", flexDirection:"column", justifyContent:"space-between",
      color: fg, boxShadow: dark ? "none" : "0 2px 20px rgba(0,0,0,0.12)"
    }}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:1, opacity:0.75, textTransform:"uppercase" }}>{label}</div>
      {children ? children : (
        <div>
          <div style={{ fontSize:34, fontWeight:800, lineHeight:1, fontVariantNumeric:"tabular-nums" }}>{value}</div>
          {sub && <div style={{ fontSize:11, opacity:0.7, marginTop:4 }}>{sub}</div>}
        </div>
      )}
    </div>
  );
};

