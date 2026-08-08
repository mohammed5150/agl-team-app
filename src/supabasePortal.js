export const SUPABASE_URL = "https://vzipsbecmirbkrbrpcdt.supabase.co";
export const SUPABASE_KEY = "sb_publishable_c6qyKoJaPEyTQ3-8nv7oFg_i3waClyQ";
export const supa = (typeof window !== "undefined" && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

export const VAPID_PUBLIC_KEY = "BPm3EK4wpAcX8cRXK86j0XqPEFKGAqOYcSxyWwe0xmN1Rasfijum1ByBaigbUpWG8bVnLQLphV34HhCVt5vvBtE";

export function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export const pushSupported = typeof window !== "undefined"
  && "serviceWorker" in navigator
  && "PushManager"   in window
  && "Notification"  in window;

export async function subscribePush(empId) {
  if (!pushSupported || !supa) return { ok: false, reason: "unsupported" };
  if (Notification.permission === "denied")
    return { ok: false, reason: "permission denied" };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return { ok: false, reason: "permission denied" };
    }
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (e) {
      console.error("[push] subscribe failed:", e);
      return { ok: false, reason: e.message || "subscribe failed" };
    }
  }

  const j = sub.toJSON();
  const { error } = await supa.from("push_subscriptions").upsert({
    user_id: empId,
    endpoint: j.endpoint,
    p256dh:   j.keys.p256dh,
    auth:     j.keys.auth,
    user_agent:   typeof navigator !== "undefined" ? (navigator.userAgent || "").slice(0, 512) : null,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) {
    console.error("[push] save subscription failed:", error);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

export async function unsubscribePush() {
  if (!pushSupported || !supa) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch (e) { console.warn("[push] unsubscribe error:", e); }
  try { await supa.from("push_subscriptions").delete().eq("endpoint", endpoint); } catch (e) { console.warn("[push] delete subscription error:", e); }
}

export async function sendPush(toEmpId, title, body, url = "/") {
  if (!supa) return;
  try {
    const { error } = await supa.functions.invoke("send-push", {
      body: { to: toEmpId, title, body, url },
    });
    if (error) console.warn("[push] send failed:", error);
  } catch (e) {
    console.warn("[push] send error:", e);
  }
}

export const empToDb = e => ({
  id: e.id, email: e.email,
  name: e.name, section: e.section,
  designation: e.designation, shift: e.shift, role: e.role || "employee",
  nationality: e.nationality, mobile: e.mobile, emp_no: e.empNo,
  dob: e.dob || null, marital_status: e.maritalStatus, address: e.address,
  join_date: e.joinDate || null,
  emergency_contact: e.emergencyContact, emergency_name: e.emergencyName,
  passport_no: e.passportNo, passport_expiry: e.passportExpiry || null,
  visa_expiry: e.visaExpiry || null, eid_no: e.eidNo, eid_expiry: e.eidExpiry || null,
  annual_leave: e.annualLeave ?? 30, used_annual: e.usedAnnual ?? 0,
  sick_leave: e.sickLeave ?? 15, used_sick: e.usedSick ?? 0, comp_off: e.compOff ?? 0,
  roster: e.roster || {}, achievements: e.achievements || [],
  warnings: e.warnings || [], actions: e.actions || [],
  training: e.training || [], documents: e.documents || [],
  rating: e.rating || {},
  profile_finalized: !!e.profileFinalized,
  initial_password: !!e.initialPassword,
  tier: e.tier || null,
});
export const empFromDb = r => ({
  id: r.id, email: r.email,
  name: r.name, section: r.section,
  designation: r.designation, shift: r.shift, role: r.role,
  nationality: r.nationality, mobile: r.mobile, empNo: r.emp_no,
  dob: r.dob || "", maritalStatus: r.marital_status || "", address: r.address || "",
  joinDate: r.join_date || "",
  emergencyContact: r.emergency_contact || "", emergencyName: r.emergency_name || "",
  passportNo: r.passport_no || "", passportExpiry: r.passport_expiry || "",
  visaExpiry: r.visa_expiry || "", eidNo: r.eid_no || "", eidExpiry: r.eid_expiry || "",
  annualLeave: r.annual_leave, usedAnnual: r.used_annual,
  sickLeave: r.sick_leave, usedSick: r.used_sick, compOff: r.comp_off,
  roster: r.roster || {}, achievements: r.achievements || [],
  warnings: r.warnings || [], actions: r.actions || [],
  training: r.training || [], documents: r.documents || [],
  rating: r.rating || {},
  profileFinalized: !!r.profile_finalized,
  initialPassword: !!r.initial_password,
  tier: r.tier || "",
});

export const lrToDb = r => ({
  id: r.id, emp_id: r.empId, emp_name: r.empName, section: r.section,
  type: r.type, start_date: r.startDate || null, end_date: r.endDate || null,
  days: r.days, reason: r.reason, status: r.status,
  applied_on: r.appliedOn || new Date().toISOString(),
  tl_comment: r.tlComment || "", mgr_comment: r.mgrComment || "",
  tl_action_date: r.tlActionDate || null, mgr_action_date: r.mgrActionDate || null,
  tl_name: r.tlName || "", mgr_name: r.mgrName || "",
});
export const lrFromDb = r => ({
  id: r.id, empId: r.emp_id, empName: r.emp_name, section: r.section,
  type: r.type, startDate: r.start_date || "", endDate: r.end_date || "",
  days: r.days, reason: r.reason || "", status: r.status,
  appliedOn: r.applied_on || "",
  tlComment: r.tl_comment || "", mgrComment: r.mgr_comment || "",
  tlActionDate: r.tl_action_date || "", mgrActionDate: r.mgr_action_date || "",
  tlName: r.tl_name || "", mgrName: r.mgr_name || "",
});

export const annToDb = a => ({
  id: a.id, title: a.title, message: a.message, priority: a.priority,
  pinned: !!a.pinned, date: a.date || new Date().toISOString(),
  by_user: a.by || "", target: a.target || "all",
});
export const annFromDb = r => ({
  id: r.id, title: r.title, message: r.message || "", priority: r.priority || "info",
  pinned: !!r.pinned, date: r.date || "", by: r.by_user || "", target: r.target || "all",
});

export const nfToDb = n => ({
  id: n.id, to_user: n.to, type: n.type, message: n.message,
  read: !!n.read, date: n.date || new Date().toISOString(),
});
export const nfFromDb = r => ({
  id: r.id, to: r.to_user, type: r.type, message: r.message || "",
  read: !!r.read, date: r.date || "",
});

export function diffById(prev, next) {
  const prevMap = new Map(prev.map(r => [r.id, r]));
  return next.filter(r => {
    const p = prevMap.get(r.id);
    if (!p) return true;
    const keys = Object.keys(r);
    if (keys.length !== Object.keys(p).length) return true;
    return keys.some(k => {
      const rv = r[k], pv = p[k];
      if (rv === pv) return false;
      // Deep-compare plain objects/arrays that are common in this schema
      if (typeof rv === "object" && rv !== null && typeof pv === "object" && pv !== null) {
        return JSON.stringify(rv) !== JSON.stringify(pv);
      }
      return true;
    });
  });
}
