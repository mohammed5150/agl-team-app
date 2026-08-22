import { ANN_PRIORITIES, ATT_YEAR, theme } from "../constants.js";
import { fmtDt, certSt } from "../helpers.js";
import { Bd, Bt, Sec } from "../uiPrimitives.jsx";
import { PASTEL, INK, Ring, MonthBars, Tile } from "./charts.jsx";
import { WeatherCard } from "./WeatherCard.jsx";
import { GlyphIcon } from "../icons.jsx";

/* ============================================================
   EMPLOYEE DASHBOARD
   ============================================================ */

export function EDash({ user, announcements, onGoTo }) {
  const h = new Date().getHours();
  const g = h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
  const myAnn = announcements.filter(a => a.target === "all" || a.target === user.section);
  const pinnedAnn = myAnn.filter(a => a.pinned).slice(0, 1);
  const latestAnn = myAnn.filter(a => !a.pinned).slice(0, 3);

  // Same classification the Training and Documents pages use (certSt), so the
  // dashboard can never disagree with them. Expired items are counted, not
  // silently dropped: an expired certificate is the most urgent state.
  const classify = (items, dateKey) => {
    const expiring = [], expired = [];
    for (const x of items || []) {
      const st = certSt(x[dateKey]);
      if (st.l === "EXPIRING") expiring.push(x);
      else if (st.l === "EXPIRED") expired.push(x);
    }
    return { expiring, expired };
  };
  const docsAttn = classify(user.documents, "expiryDate");
  const certsAttn = classify(user.training, "certExpiry");
  const totalCerts = user.training?.length || 0;
  const validCerts = totalCerts - certsAttn.expiring.length - certsAttn.expired.length;

  // Today roster code for the status pill
  const today = new Date();
  const mk = `${ATT_YEAR}-${String(today.getMonth()+1).padStart(2,"0")}`;
  const dayIdx = today.getDate() - 1;
  const todayCode = user.roster?.[mk]?.[dayIdx]?.code;
  const dutyLabel = todayCode === "O" ? "OFF DUTY"
    : todayCode === "L" ? "ON LEAVE"
    : todayCode === "M" ? "MORNING SHIFT"
    : todayCode === "N" ? "NIGHT SHIFT" : "ON DUTY";
  const dutyColor = todayCode === "O" || todayCode === "L" ? "#94a3b8" : "#10b981";

  // Leave ring: annual used vs allowed
  const annualUsedPct = user.annualLeave ? user.usedAnnual / user.annualLeave : 0;
  const annualLeft = user.annualLeave - user.usedAnnual;

  // Leave days per calendar month, from the roster's "L" codes. All twelve
  // months of the year, not a hardcoded window.
  const monthlyLeaves = Array.from({ length: 12 }, (_, m) => {
    const r = user.roster?.[`${ATT_YEAR}-${String(m+1).padStart(2,"0")}`] || [];
    return r.filter(d => d.code === "L").length;
  });
  const leaveDaysThisYear = monthlyLeaves.reduce((a, b) => a + b, 0);
  // Only meaningful while the chart's year is the current year.
  const currentMonthIdx = today.getFullYear() === ATT_YEAR ? today.getMonth() : -1;

  const dateStr = today.toLocaleDateString("en-GB", { weekday:"short", day:"2-digit", month:"short" }).toUpperCase();

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:theme.ts, letterSpacing:1, textTransform:"uppercase", fontWeight:700 }}>{g}</div>
          <h2 style={{ fontSize:26, fontWeight:800, color:theme.tx, margin:0, letterSpacing:-0.3 }}>
            {user.name.split(" ")[0].toUpperCase()}
          </h2>
        </div>
        <div aria-label={`Avatar for ${user.name}`} role="img" style={{ width:48, height:48, borderRadius:"50%", background:theme.gp,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:800, color:"#fff" }}>
          {user.name.split(" ").map(n => n[0]).join("").slice(0,2)}
        </div>
      </div>
      <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 12px",
        background:theme.ch, borderRadius:20, marginBottom:18, fontSize:11, fontWeight:700, letterSpacing:0.5, color:theme.ts }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:dutyColor }} />
        {dateStr} · {dutyLabel}
      </div>

      {/* Conditions at this person's own airfield, from their employee record. */}
      <WeatherCard user={user} />

      {/* Pinned announcement (if any) */}
      {pinnedAnn.map(a => {
        const pr = ANN_PRIORITIES.find(p => p.key === a.priority);
        return (
          <div key={a.id} onClick={() => onGoTo("announcements")} style={{
            background:`linear-gradient(135deg, ${pr.color}22, ${pr.color}08)`,
            border:`1px solid ${pr.color}40`, borderRadius:18,
            padding:"14px 16px", marginBottom:16, cursor:"pointer"
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:4 }}>
              <div style={{ fontSize:13, fontWeight:800, color:theme.tx }}><span style={{ display:"inline-flex", verticalAlign:"-2px", marginRight:6, color:theme.ol }}><GlyphIcon glyph="bookmark" size={13} /></span>{a.title}</div>
              <Bd text={pr.label.toUpperCase()} color={pr.color} />
            </div>
            <div style={{ fontSize:12, color:theme.ts }}>
              {a.message.length > 120 ? a.message.slice(0, 120) + "…" : a.message}
            </div>
          </div>
        );
      })}

      {/* Hero: Annual Leave ring */}
      <div style={{ background:PASTEL.coral, borderRadius:theme.r.hero, padding:20, marginBottom:14,
        display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:160 }}>
          <div style={{ fontSize:11, fontWeight:700, color:INK, opacity:0.75, letterSpacing:1 }}>THIS YEAR</div>
          <div style={{ fontSize:30, fontWeight:900, color:INK, letterSpacing:-0.5, margin:"4px 0 10px" }}>LEAVE BALANCE</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:12, color:INK }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:"50%", background:INK }} />Annual used</span>
              <b>{user.usedAnnual}/{user.annualLeave}</b>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:"50%", background:"#fff" }} />Sick left</span>
              <b>{user.sickLeave - user.usedSick}/{user.sickLeave}</b>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:"50%", background:"rgba(0,0,0,0.35)" }} />Comp-off</span>
              <b>{user.compOff}</b>
            </div>
          </div>
        </div>
        <Ring value={annualUsedPct} size={130} stroke={12} color={INK} track="rgba(255,255,255,0.5)"
          label={annualLeft} sub="DAYS LEFT" />
      </div>

      {/* Monthly leave trend + certs status */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        <Tile bg={PASTEL.lilac} label={`Leave taken in ${ATT_YEAR}`}>
          <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"flex-end", color:INK }}>
            {leaveDaysThisYear > 0 ? (
              <>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>
                  {leaveDaysThisYear} day{leaveDaysThisYear === 1 ? "" : "s"} so far
                </div>
                <MonthBars values={monthlyLeaves} color={INK} active={currentMonthIdx} />
              </>
            ) : (
              <div style={{ fontSize:12, fontWeight:600, opacity:0.75, lineHeight:1.5 }}>
                No leave days on your {ATT_YEAR} roster yet.
              </div>
            )}
          </div>
        </Tile>
        <Tile bg={PASTEL.butter} label="Valid Certificates"
          value={validCerts}
          sub={`${certsAttn.expired.length} expired · ${certsAttn.expiring.length} expiring · ${totalCerts} total`}
          onClick={() => onGoTo("training")} />
      </div>

      {/* Action Required card (if anything expiring) */}
      {(certsAttn.expired.length + certsAttn.expiring.length + docsAttn.expired.length + docsAttn.expiring.length > 0) && (
        <Tile bg={theme.cs} dark label="Action Required">
          <div style={{ marginTop:8 }}>
            {[
              ...certsAttn.expired.map(x => ({ key:"c"+x.id, title:x.title, when:`Expired ${x.certExpiry}` })),
              ...docsAttn.expired.map(x => ({ key:"d"+x.id, title:x.title, when:`Document expired ${x.expiryDate}` })),
              ...certsAttn.expiring.map(x => ({ key:"c"+x.id, title:x.title, when:`Expires ${x.certExpiry}`, soon:true })),
              ...docsAttn.expiring.map(x => ({ key:"d"+x.id, title:x.title, when:`Document expires ${x.expiryDate}`, soon:true })),
            ].slice(0, 6).map(row => (
              <div key={row.key} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"10px 0", borderBottom:`1px solid ${theme.bd}`, gap:6, flexWrap:"wrap"
              }}>
                <div>
                  <div style={{ fontSize:13, color:theme.tx, fontWeight:600 }}>{row.title}</div>
                  <div style={{ fontSize:11, color:theme.td }}>{row.when}</div>
                </div>
                <Bd text={row.soon ? "EXPIRING" : "EXPIRED"} color={row.soon ? theme.yl : theme.rd} />
              </div>
            ))}
          </div>
        </Tile>
      )}

      <div style={{ height:14 }} />

      {/* Latest announcements list */}
      {latestAnn.length > 0 && (
        <Sec title="Announcements" icon="📢" action={<Bt onClick={() => onGoTo("announcements")} small={true} outline={true}>View all</Bt>}>
          {latestAnn.map(a => {
            const pr = ANN_PRIORITIES.find(p => p.key === a.priority);
            return (
              <div key={a.id} style={{ padding:"10px 0", borderBottom:`1px solid ${theme.bd}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:theme.tx }}>{a.title}</div>
                  <Bd text={pr.label.toUpperCase()} color={pr.color} />
                </div>
                <div style={{ fontSize:11, color:theme.td, marginTop:4 }}>{fmtDt(a.date)} • {a.by}</div>
              </div>
            );
          })}
        </Sec>
      )}

      {user.achievements?.length > 0 && (
        <Sec title="My Achievements" icon="🏆">
          {user.achievements.map(a => (
            <div key={a.id} style={{
              background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.2)",
              borderRadius:10, padding:14, marginBottom:8
            }}>
              <div style={{ fontSize:13, fontWeight:600, color:theme.gn }}>{a.title}</div>
              <div style={{ fontSize:11, color:theme.ts, marginTop:4 }}>{a.desc}</div>
            </div>
          ))}
        </Sec>
      )}
    </div>
  );
}

