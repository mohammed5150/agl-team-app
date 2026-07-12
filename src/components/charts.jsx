
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
        <div style={{ fontSize:28, fontWeight:800, color:INK, lineHeight:1 }}>{label}</div>
        {sub && <div style={{ fontSize:10, fontWeight:700, color:INK, opacity:0.7, marginTop:2, letterSpacing:0.4 }}>{sub}</div>}
      </div>
    </div>
  );
};

// Simple bar sparkline (for tiny trend charts)
export const Spark = ({ values, color=INK, height=50, active=-1 }) => {
  const max = Math.max(1, ...values);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:4, height, width:"100%" }}>
      {values.map((v, i) => (
        <div key={i} style={{
          flex:1, height:`${Math.max(8, (v/max)*height)}px`,
          background: i === active ? color : `${color}55`,
          borderRadius:6,
        }} />
      ))}
    </div>
  );
};

// Small square tile in the new aesthetic
export const Tile = ({ bg, label, value, sub, dark=false, children, onClick }) => {
  const fg = dark ? "#f0f4f8" : INK;
  return (
    <div onClick={onClick} style={{
      background: bg, borderRadius:22, padding:18,
      minHeight:150, cursor: onClick ? "pointer" : "default",
      display:"flex", flexDirection:"column", justifyContent:"space-between",
      color: fg, boxShadow: dark ? "none" : "0 2px 20px rgba(0,0,0,0.12)"
    }}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:1, opacity:0.75, textTransform:"uppercase" }}>{label}</div>
      {children ? children : (
        <div>
          <div style={{ fontSize:34, fontWeight:800, lineHeight:1 }}>{value}</div>
          {sub && <div style={{ fontSize:11, opacity:0.7, marginTop:4 }}>{sub}</div>}
        </div>
      )}
    </div>
  );
};

