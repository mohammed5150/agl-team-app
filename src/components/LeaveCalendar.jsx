import { STATUS_COLORS, STATUS_LABELS, MONTHS, theme } from "../constants.js";
import { Bd, Sec, Empty } from "../uiPrimitives.jsx";

const { useState } = React;

/* ============================================================
   LEAVE CALENDAR (NEW)
   ============================================================ */

export function LeaveCalendar({ leaveRequests }) {
  const [selectedMonth, setSelectedMonth] = useState(3); // April default
  const [selDay, setSelDay] = useState(null);
  const year = 2026;

  const firstDay = new Date(year, selectedMonth, 1).getDay();
  const daysInMonth = new Date(year, selectedMonth + 1, 0).getDate();
  const weeks = [];
  let current = [];
  for (let i = 0; i < firstDay; i++) current.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    current.push(d);
    if (current.length === 7) { weeks.push(current); current = []; }
  }
  if (current.length) {
    while (current.length < 7) current.push(null);
    weeks.push(current);
  }

  const onLeaveOn = (day) => {
    if (!day) return [];
    const dStr = `${year}-${String(selectedMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return leaveRequests.filter(r => {
      if (r.status === "rejected") return false;
      return dStr >= r.startDate && dStr <= r.endDate;
    });
  };

  const dayDetails = selDay != null ? onLeaveOn(selDay) : [];
  const dayStr = selDay != null
    ? `${year}-${String(selectedMonth+1).padStart(2,"0")}-${String(selDay).padStart(2,"0")}`
    : "";

  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, marginBottom:16 }}>Leave Calendar</h2>
      <p style={{ color:theme.ts, fontSize:13, marginBottom:16 }}>
        Plan approvals by spotting overlaps. Click a day to see everyone on leave that day.
      </p>

      <div style={{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" }}>
        {[0,1,2,3,4,5].map(m => (
          <div key={m} onClick={() => { setSelectedMonth(m); setSelDay(null); }} style={{
            padding:"8px 18px", borderRadius:10, cursor:"pointer",
            fontSize:13, fontWeight:600,
            background: selectedMonth === m ? theme.ga : theme.card,
            color: selectedMonth === m ? "#fff" : theme.ts
          }}>{MONTHS[m]} {year}</div>
        ))}
      </div>

      <div style={{ background:theme.card, borderRadius:14, padding:14, border:`1px solid ${theme.bd}`, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:6 }}>
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
            <div key={d} style={{
              padding:6, textAlign:"center", fontSize:10, fontWeight:700,
              color:theme.td, textTransform:"uppercase"
            }}>{d}</div>
          ))}
        </div>
        {weeks.map((w, wi) => (
          <div key={wi} style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:4 }}>
            {w.map((day, di) => {
              if (!day) return <div key={di} />;
              const leaves = onLeaveOn(day);
              const isSel = selDay === day;
              const bgColor = leaves.length === 0
                ? theme.ch
                : leaves.length >= 3 ? "rgba(239,68,68,0.20)"
                : leaves.length === 2 ? "rgba(245,158,11,0.20)"
                : "rgba(56,189,248,0.15)";
              const brColor = isSel ? theme.or
                : leaves.length >= 3 ? theme.rd
                : leaves.length === 2 ? theme.yl
                : leaves.length === 1 ? theme.bu
                : theme.bd;
              return (
                <div key={di} onClick={() => setSelDay(day)} style={{
                  minHeight:60, padding:6, borderRadius:8, cursor:"pointer",
                  background: bgColor, border:`1px solid ${brColor}`,
                  display:"flex", flexDirection:"column", gap:3,
                  transform: isSel ? "scale(1.03)" : "none", transition:"transform 0.15s"
                }}>
                  <div style={{ fontSize:12, fontWeight:700, color:theme.tx }}>{day}</div>
                  {leaves.length > 0 && (
                    <div style={{ fontSize:10, color:theme.ts, lineHeight:1.3 }}>
                      {leaves.slice(0,2).map(r => (
                        <div key={r.id} style={{
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                          color: r.status === "approved" ? theme.gn : r.status === "tl_approved" ? theme.bu : theme.yl
                        }}>{r.empName.split(" ")[0]}</div>
                      ))}
                      {leaves.length > 2 && <div style={{ color:theme.td }}>+{leaves.length - 2} more</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16 }}>
        <Bd text="Approved" color={theme.gn} />
        <Bd text="TL Approved" color={theme.bu} />
        <Bd text="Pending" color={theme.yl} />
        <Bd text="2+ overlapping = orange" color={theme.yl} />
        <Bd text="3+ overlapping = red" color={theme.rd} />
      </div>

      {selDay != null && (
        <Sec title={`${dayStr} - ${dayDetails.length} on leave`} icon="📅">
          {dayDetails.length === 0
            ? <Empty icon="✅" text="Everyone is on duty" />
            : dayDetails.map(r => (
              <div key={r.id} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"10px 0", borderBottom:`1px solid ${theme.bd}`, gap:6, flexWrap:"wrap"
              }}>
                <div>
                  <div style={{ fontSize:13, color:theme.tx, fontWeight:500 }}>{r.empName}</div>
                  <div style={{ fontSize:11, color:theme.td }}>{r.section} • {r.type}</div>
                </div>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <Bd text={`${r.days}d`} color={theme.bu} />
                  <Bd text={STATUS_LABELS[r.status]} color={STATUS_COLORS[r.status]} />
                </div>
              </div>
            ))}
        </Sec>
      )}
    </div>
  );
}

