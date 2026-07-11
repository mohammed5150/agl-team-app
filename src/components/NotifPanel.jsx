import { theme } from "../constants.js";
import { fmtDt } from "../helpers.js";
import { subscribePush } from "../supabasePortal.js";

const { useState } = React;

/* ============================================================
   NOTIFICATIONS PANEL (bell dropdown)
   ============================================================ */

export function NotifPanel({ notifs, onClose, onMarkRead, onMarkAll, onGoTo, currentUser }) {
  const unread = notifs.filter(n => !n.read);
  const [notifPerm, setNotifPerm] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const askPerm = async () => {
    if (!("Notification" in window)) return;
    const r = await Notification.requestPermission();
    setNotifPerm(r);
    if (r === "granted") {
      // Subscribe this browser/device to push and persist to Supabase.
      if (currentUser?.id) {
        const res = await subscribePush(currentUser.id);
        if (!res.ok) console.warn("[push] subscribe:", res.reason);
      }
      new Notification("ADB Portal", { body: "Push notifications enabled ✅", icon: "/icon-192.png" });
    }
  };
  const iconFor = (tp) => tp === "approved" ? "✅"
    : tp === "rejected" ? "❌"
    : tp === "announcement" ? "📢"
    : "🔔";
  const go = (n) => {
    onMarkRead(n.id);
    if (n.type === "announcement") onGoTo("announcements");
    else if (n.type === "new_request") onGoTo("approvals");
    else if (n.type === "approved" || n.type === "rejected") onGoTo("leave");
  };

  return (
    <div onClick={e => e.stopPropagation()} style={{
      position:"absolute", top:32, right:0, width:340, maxHeight:420, overflowY:"auto",
      background:theme.cs, border:`1px solid ${theme.bl}`, borderRadius:12,
      boxShadow:"0 12px 40px rgba(0,0,0,0.5)", zIndex:100
    }}>
      {notifPerm === "default" && (
        <div style={{ padding:"10px 14px", background:"rgba(56,189,248,0.08)", borderBottom:`1px solid ${theme.bd}` }}>
          <div style={{ fontSize:12, color:theme.tx, marginBottom:6 }}>Get browser alerts for new items</div>
          <button onClick={askPerm} style={{
            background:theme.bu, color:"#fff", border:"none", padding:"6px 12px",
            borderRadius:8, fontSize:11, fontWeight:700, cursor:"pointer"
          }}>🔔 Enable notifications</button>
        </div>
      )}
      {notifPerm === "granted" && (
        <div style={{ padding:"6px 14px", fontSize:10, color:theme.gn, background:"rgba(16,185,129,0.08)", borderBottom:`1px solid ${theme.bd}` }}>
          ✅ Browser notifications enabled
        </div>
      )}
      {notifPerm === "denied" && (
        <div style={{ padding:"6px 14px", fontSize:10, color:theme.rd, background:"rgba(239,68,68,0.08)", borderBottom:`1px solid ${theme.bd}` }}>
          🚫 Blocked — enable via browser settings
        </div>
      )}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"12px 14px", borderBottom:`1px solid ${theme.bd}`,
        position:"sticky", top:0, background:theme.cs, zIndex:1
      }}>
        <div style={{ fontSize:13, fontWeight:700, color:theme.tx }}>
          Notifications {unread.length > 0 && <span style={{ color:theme.or }}>({unread.length})</span>}
        </div>
        {unread.length > 0 && (
          <button onClick={onMarkAll} style={{
            background:"none", border:"none", color:theme.bu, fontSize:11, cursor:"pointer", fontWeight:600
          }}>Mark all read</button>
        )}
      </div>
      {notifs.length === 0 ? (
        <div style={{ padding:"30px 16px", textAlign:"center", color:theme.td, fontSize:13 }}>
          <div style={{ fontSize:28, opacity:0.4, marginBottom:6 }}>📭</div>
          No notifications
        </div>
      ) : (
        notifs.slice(0, 20).map(n => (
          <div key={n.id} onClick={() => go(n)} style={{
            padding:"10px 14px", borderBottom:`1px solid ${theme.bd}`, cursor:"pointer",
            background: n.read ? "transparent" : "rgba(232,112,42,0.06)",
            display:"flex", gap:10
          }}>
            <div style={{ fontSize:16 }}>{iconFor(n.type)}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, color: n.read ? theme.ts : theme.tx, fontWeight: n.read ? 400 : 600 }}>{n.message}</div>
              <div style={{ fontSize:10, color:theme.td, marginTop:2 }}>{fmtDt(n.date)}</div>
            </div>
            {!n.read && <div style={{ width:6, height:6, borderRadius:"50%", background:theme.or, marginTop:6 }} />}
          </div>
        ))
      )}
    </div>
  );
}

