/* ============================================================
   MANAGER DASHBOARD
   ============================================================ */

import { SECTIONS, STATUS_COLORS, STATUS_LABELS, ANN_PRIORITIES, theme } from "../constants.js";
import { Bd, Bt, Sec, Empty } from "../uiPrimitives.jsx";
import { PASTEL, INK, Ring, Tile } from "./charts.jsx";
import { WeatherCard } from "./WeatherCard.jsx";

export function MDash({ user, employees, leaveRequests, announcements, pc, onGoTo }) {
  const h = new Date().getHours();
  const g = h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
  const today = new Date();
  const onLeaveToday = leaveRequests.filter(r => {
    if (r.status !== "approved") return false;
    const s = new Date(r.startDate), e = new Date(r.endDate);
    return today >= s && today <= e;
  });
  const onDutyToday = employees.length - onLeaveToday.length;
  const dutyPct = employees.length ? onDutyToday / employees.length : 1;
  const expiringCerts = employees.reduce((a, e) => a + (e.training || []).filter(x => {
    if (!x.certExpiry) return false;
    const expDate = new Date(x.certExpiry);
    if (isNaN(expDate.getTime())) return false;
    const d = (expDate - new Date()) / 864e5;
    return d >= 0 && d <= 90;
  }).length, 0);
  const expiringDocs = employees.reduce((a, e) => a + (e.documents || []).filter(x => {
    if (!x.expiryDate) return false;
    const expDate = new Date(x.expiryDate);
    if (isNaN(expDate.getTime())) return false;
    const d = (expDate - new Date()) / 864e5;
    return d >= 0 && d <= 90;
  }).length, 0);
  const pinnedAnn = announcements.filter(a => a.pinned).slice(0, 1);
  const sectionCounts = SECTIONS.map(s => ({
    name: s, count: employees.filter(e => e.section === s).length
  }));
  const maxSectionCount = Math.max(1, ...sectionCounts.map(s => s.count));
  const dateStr = today.toLocaleDateString("en-GB", { weekday:"short", day:"2-digit", month:"short" }).toUpperCase();

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:theme.ts, letterSpacing:1, textTransform:"uppercase", fontWeight:700 }}>{g}</div>
          <h2 style={{ fontSize:26, fontWeight:800, color:theme.tx, margin:0, letterSpacing:-0.3 }}>{user.name.toUpperCase()}</h2>
        </div>
        <div aria-label={`Avatar for ${user.name}`} role="img" style={{ width:48, height:48, borderRadius:"50%", background:theme.ga,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:800, color:"#fff" }}>
          {user.name.split(" ").map(n => n[0]).join("").slice(0,2)}
        </div>
      </div>

      {/* Managers cover every site, so this one carries the switcher. */}
      <WeatherCard user={user} canSwitchSite={true} />
      <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 12px",
        background:theme.ch, borderRadius:20, marginBottom:18, fontSize:11, fontWeight:700, letterSpacing:0.5, color:theme.ts }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:"#10b981" }} />
        {dateStr} · {pc} PENDING
      </div>

      {/* Pinned banner */}
      {pinnedAnn.length > 0 && pinnedAnn.map(a => {
        const pr = ANN_PRIORITIES.find(p => p.key === a.priority);
        return (
          <div key={a.id} onClick={() => onGoTo("announcements")} style={{
            background:`linear-gradient(135deg, ${pr.color}22, ${pr.color}08)`,
            border:`1px solid ${pr.color}40`, borderRadius:18,
            padding:"14px 16px", marginBottom:16, cursor:"pointer"
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:4 }}>
              <div style={{ fontSize:13, fontWeight:800, color:theme.tx }}>📌 {a.title}</div>
              <Bd text={pr.label.toUpperCase()} color={pr.color} />
            </div>
            <div style={{ fontSize:12, color:theme.ts }}>
              {a.message.length > 120 ? a.message.slice(0, 120) + "…" : a.message}
            </div>
          </div>
        );
      })}

      {/* Hero: Team on duty ring */}
      <div style={{ background:PASTEL.coral, borderRadius:24, padding:20, marginBottom:14,
        display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:160 }}>
          <div style={{ fontSize:11, fontWeight:700, color:INK, opacity:0.75, letterSpacing:1 }}>TEAM TODAY</div>
          <div style={{ fontSize:30, fontWeight:900, color:INK, letterSpacing:-0.5, margin:"4px 0 10px" }}>ON DUTY</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:12, color:INK }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:"50%", background:INK }} />Active</span>
              <b>{onDutyToday}/{employees.length}</b>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:"50%", background:"#fff" }} />On Leave</span>
              <b>{onLeaveToday.length}</b>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ width:8, height:8, borderRadius:"50%", background:"rgba(0,0,0,0.35)" }} />Pending</span>
              <b>{pc}</b>
            </div>
          </div>
        </div>
        <Ring value={dutyPct} size={130} stroke={12} color={INK} track="rgba(255,255,255,0.5)"
          label={Math.round(dutyPct*100) + "%"} sub="ON DUTY" />
      </div>

      {/* Two small cards row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        <Tile bg={PASTEL.lilac} label="Approvals" value={pc} sub="awaiting your review" onClick={() => onGoTo("approvals")} />
        <Tile bg={PASTEL.butter} label="Expiring" value={expiringCerts + expiringDocs} sub="certs + documents ≤90d" onClick={() => onGoTo("documents")} />
      </div>

      {/* Section breakdown as dark card with horizontal bars */}
      <Tile bg={theme.cs} dark label="Section Breakdown">
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:8 }}>
          {sectionCounts.map((s, i) => (
            <div key={s.name} style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:100, fontSize:12, color:theme.tx, fontWeight:600 }}>{s.name}</div>
              <div style={{ flex:1, height:8, background:"rgba(255,255,255,0.08)", borderRadius:99, overflow:"hidden" }}>
                <div style={{ width:`${(s.count/maxSectionCount)*100}%`, height:"100%",
                  background: [PASTEL.coral, PASTEL.lilac, PASTEL.mint, PASTEL.butter, PASTEL.sky][i % 5],
                  borderRadius:99 }} />
              </div>
              <div style={{ width:24, fontSize:13, fontWeight:800, color:theme.tx, textAlign:"right" }}>{s.count}</div>
            </div>
          ))}
        </div>
      </Tile>

      <div style={{ height:14 }} />

      {/* Recent activity + on leave today */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:14 }}>
        <Sec title="Recent Leave" icon="📋" action={<Bt onClick={() => onGoTo("leave")} small={true} outline={true}>View all</Bt>}>
          {leaveRequests.slice(0, 4).map(r => (
            <div key={r.id} style={{
              display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"10px 0", borderBottom:`1px solid ${theme.bd}`, flexWrap:"wrap", gap:4
            }}>
              <div>
                <div style={{ fontSize:13, color:theme.tx, fontWeight:600 }}>{r.empName}</div>
                <div style={{ fontSize:11, color:theme.td }}>{r.type} • {r.days}d</div>
              </div>
              <Bd text={STATUS_LABELS[r.status]} color={STATUS_COLORS[r.status]} />
            </div>
          ))}
        </Sec>

        <Sec title="On Leave Today" icon="🏖️" action={<Bt onClick={() => onGoTo("calendar")} small={true} outline={true}>Calendar</Bt>}>
          {onLeaveToday.length === 0
            ? <Empty icon="📅" text="Everyone is on duty" />
            : onLeaveToday.map(r => (
              <div key={r.id} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"10px 0", borderBottom:`1px solid ${theme.bd}`, flexWrap:"wrap", gap:4
              }}>
                <div>
                  <div style={{ fontSize:13, color:theme.tx, fontWeight:600 }}>{r.empName}</div>
                  <div style={{ fontSize:11, color:theme.td }}>{r.type} • until {r.endDate}</div>
                </div>
                <Bd text={r.section} color={theme.bu} />
              </div>
            ))}
        </Sec>
      </div>
    </div>
  );
}

