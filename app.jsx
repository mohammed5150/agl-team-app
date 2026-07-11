import { theme } from "./src/constants.js";
import { NE, NM } from "./src/nav.js";
import { TIERS_CAP } from "./src/rating.js";
import { INITIAL_EMPLOYEES, INITIAL_LEAVE_REQUESTS, INITIAL_ANNOUNCEMENTS, nfId, INITIAL_NOTIFICATIONS } from "./src/seedData.js";
import { nextEmpId } from "./src/helpers.js";
import { applyLeaveAction } from "./src/leaveWorkflow.js";
import { supa, subscribePush, unsubscribePush, sendPush, empToDb, empFromDb, lrToDb, lrFromDb, annToDb, annFromDb, nfToDb, nfFromDb, diffById, pushSupported } from "./src/supabasePortal.js";
import { Logo, Bd, Bt } from "./src/uiPrimitives.jsx";
import { LoginPage } from "./src/LoginPage.jsx";
import { ErrorBoundary } from "./src/ErrorBoundary.jsx";
import { AnnPg } from "./src/components/AnnouncementsPage.jsx";
import { AttPg, MyAtt } from "./src/components/AttendancePage.jsx";
import { ChPw } from "./src/components/ChangePassword.jsx";
import { EDash } from "./src/components/DashboardEmployee.jsx";
import { MDash } from "./src/components/DashboardManager.jsx";
import { MyDocs, DocsMgmt } from "./src/components/DocumentsPage.jsx";
import { LeaveCalendar } from "./src/components/LeaveCalendar.jsx";
import { LvPg, ApPg } from "./src/components/LeavePage.jsx";
import { NotifPanel } from "./src/components/NotifPanel.jsx";
import { Perf } from "./src/components/PerformancePage.jsx";
import { Prof } from "./src/components/Profile.jsx";
import { Team } from "./src/components/TeamPage.jsx";
import { MyTr, TrMgmt } from "./src/components/TrainingPage.jsx";

const { useState, useCallback, useEffect, useRef } = React;

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [nav, setNav] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);
  const [viewEmployee, setViewEmployee] = useState(null);
  const [leaveRequests, setLeaveRequests] = useState(INITIAL_LEAVE_REQUESTS);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [announcements, setAnnouncements] = useState(INITIAL_ANNOUNCEMENTS);
  const [nextLrId, setNextLrId] = useState(5);
  const [nextAnnId, setNextAnnId] = useState(6);
  const [selectedMonth, setSelectedMonth] = useState(3); // April
  const [showNotif, setShowNotif] = useState(false);
  const [syncError, setSyncError] = useState("");

  // --- Persistence: Supabase Auth + Supabase DB (tables RLS-protected)
  //   Data is only loaded once the user has an authenticated session.
  const LOCAL_KEY = "adb-portal-local-v2";
  const hydrated = useRef(false);
  const prevEmployeesRef     = useRef([]);
  const prevLeaveRequestsRef = useRef([]);
  const prevAnnouncementsRef = useRef([]);
  const prevNotificationsRef = useRef([]);

  // Load UI-only state from localStorage immediately
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.notifications)) setNotifications(d.notifications);
        if (typeof d.nextLrId === "number") setNextLrId(d.nextLrId);
        if (typeof d.nextAnnId === "number") setNextAnnId(d.nextAnnId);
      }
    } catch {}
  }, []);

  // Load all team data from Supabase for an authenticated user
  const loadPortalData = useCallback(async (authEmail) => {
    try {
      const [empsR, lrsR, annsR, nfsR] = await Promise.all([
        supa.from("employees").select("*").order("id"),
        supa.from("leave_requests").select("*").order("applied_on", { ascending: false }),
        supa.from("announcements").select("*").order("date", { ascending: false }),
        supa.from("notifications").select("*").order("date", { ascending: false }),
      ]);
      if (empsR.error) console.error("[portal] employees load:", empsR.error);
      if (lrsR.error)  console.error("[portal] leaves load:",    lrsR.error);
      if (annsR.error) console.error("[portal] anns load:",      annsR.error);
      if (nfsR.error)  console.error("[portal] notifs load:",    nfsR.error);

      const emps = (empsR.data || []).map(empFromDb);
      const matches = emps.filter(e => e.email?.toLowerCase() === authEmail?.toLowerCase());
      const me = matches[0];
      if (!me) {
        console.warn("[portal] authenticated email has no employee record:", authEmail);
        setLoginError(
          "Your email (" + authEmail + ") is not registered as an employee. Please contact your admin."
        );
        await supa.auth.signOut();
        return;
      }
      const lrs  = (lrsR.data  || []).map(lrFromDb);
      const anns = (annsR.data || []).map(annFromDb);
      setEmployees(emps);
      setLeaveRequests(lrs);
      setAnnouncements(anns);
      prevEmployeesRef.current     = emps;
      prevLeaveRequestsRef.current = lrs;
      prevAnnouncementsRef.current = anns;
      // Seed notifications if empty
      let nfs;
      if (!nfsR.data || nfsR.data.length === 0) {
        await supa.from("notifications").upsert(INITIAL_NOTIFICATIONS.map(nfToDb));
        const { data } = await supa.from("notifications").select("*").order("date", { ascending: false });
        nfs = (data || []).map(nfFromDb);
      } else {
        nfs = nfsR.data.map(nfFromDb);
      }
      setNotifications(nfs);
      prevNotificationsRef.current = nfs;
      setCurrentUser(me);

      // If this device already granted notification permission, refresh the
      // push subscription quietly. New devices will see the "Enable" button
      // in the notifications panel and opt in there.
      if (pushSupported && Notification.permission === "granted") {
        subscribePush(me.id).catch(e => console.warn("[push] refresh:", e));
      }

      // Realtime
      if (!window.__portalChannel) {
        window.__portalChannel = supa.channel("portal")
          .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, async () => {
            const { data } = await supa.from("employees").select("*").order("id");
            if (data) {
              const fresh = data.map(empFromDb);
              prevEmployeesRef.current = fresh;
              setEmployees(fresh);
            }
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, async () => {
            const { data } = await supa.from("leave_requests").select("*").order("applied_on", { ascending: false });
            if (data) {
              const fresh = data.map(lrFromDb);
              prevLeaveRequestsRef.current = fresh;
              setLeaveRequests(fresh);
            }
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, async () => {
            const { data } = await supa.from("announcements").select("*").order("date", { ascending: false });
            if (data) {
              const fresh = data.map(annFromDb);
              prevAnnouncementsRef.current = fresh;
              setAnnouncements(fresh);
            }
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, async (payload) => {
            const fresh = nfFromDb(payload.new);
            setNotifications(p => {
              if (p.some(n => n.id === fresh.id)) return p;
              const next = [fresh, ...p];
              prevNotificationsRef.current = next;
              return next;
            });
            // Browser toast if this notif is for the logged-in user
            try {
              if (typeof window !== "undefined" && window.__currentUserId === fresh.to
                  && "Notification" in window && Notification.permission === "granted") {
                const n = new Notification("ADB AGL Portal", {
                  body: fresh.message, icon: "/icon-192.png", badge: "/icon-192.png", tag: fresh.id,
                });
                n.onclick = () => { window.focus(); n.close(); };
              }
            } catch (e) { console.warn("notif display error", e); }
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, async (payload) => {
            const fresh = nfFromDb(payload.new);
            setNotifications(p => {
              const next = p.map(n => n.id === fresh.id ? fresh : n);
              prevNotificationsRef.current = next;
              return next;
            });
          })
          .subscribe();
      }
    } catch (e) {
      console.error("[portal] loadPortalData error:", e);
    }
  }, [setLoginError]);

  // Session management: restore existing session on mount, react to sign-in/out
  useEffect(() => {
    if (!supa) { hydrated.current = true; return; }
    let mounted = true;

    const handle = async (session) => {
      if (!mounted) return;
      if (session?.user?.email) {
        await loadPortalData(session.user.email);
      } else {
        setCurrentUser(null);
        setEmployees([]);
        setLeaveRequests([]);
        setAnnouncements([]);
      }
      hydrated.current = true;
    };

    supa.auth.getSession().then(({ data }) => handle(data.session));
    const { data: { subscription } } = supa.auth.onAuthStateChange((_event, session) => handle(session));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [loadPortalData]);

  // Save UI-only state (notifications + counters) to localStorage
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({
        notifications, nextLrId, nextAnnId,
      }));
    } catch {}
  }, [notifications, nextLrId, nextAnnId]);

  // Debounced upsert: only rows that actually changed are pushed.
  // RLS policies restrict each user to writing rows they own/can manage,
  // so bulk-upserting the whole table would be rejected.
  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const changed = diffById(prevEmployeesRef.current, employees);
      prevEmployeesRef.current = employees;
      if (!changed.length) return;
      supa.from("employees").upsert(changed.map(empToDb))
        .then(r => { if (r.error) { console.error("employees upsert:", r.error); setSyncError("Couldn't save employee changes"); } });
    }, 400);
    return () => clearTimeout(t);
  }, [employees]);

  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const changed = diffById(prevLeaveRequestsRef.current, leaveRequests);
      prevLeaveRequestsRef.current = leaveRequests;
      if (!changed.length) return;
      supa.from("leave_requests").upsert(changed.map(lrToDb))
        .then(r => { if (r.error) { console.error("leave_requests upsert:", r.error); setSyncError("Couldn't save leave request changes"); } });
    }, 400);
    return () => clearTimeout(t);
  }, [leaveRequests]);

  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const changed = diffById(prevAnnouncementsRef.current, announcements);
      prevAnnouncementsRef.current = announcements;
      if (!changed.length) return;
      supa.from("announcements").upsert(changed.map(annToDb))
        .then(r => { if (r.error) { console.error("announcements upsert:", r.error); setSyncError("Couldn't save announcement changes"); } });
    }, 400);
    return () => clearTimeout(t);
  }, [announcements]);

  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const changed = diffById(prevNotificationsRef.current, notifications);
      prevNotificationsRef.current = notifications;
      if (!changed.length) return;
      supa.from("notifications").upsert(changed.map(nfToDb))
        .then(r => { if (r.error) { console.error("notifications upsert:", r.error); setSyncError("Couldn't save notification changes"); } });
    }, 400);
    return () => clearTimeout(t);
  }, [notifications]);

  // Expose currentUser.id for the realtime callback to check incoming notifs
  useEffect(() => {
    if (typeof window !== "undefined") window.__currentUserId = currentUser?.id || null;
  }, [currentUser]);

  // Sync-failure toast auto-dismisses after a few seconds
  useEffect(() => {
    if (!syncError) return;
    const t = setTimeout(() => setSyncError(""), 6000);
    return () => clearTimeout(t);
  }, [syncError]);

  // Hash routing: keep the active view in the URL (#/leave) so refreshes and
  // shared links land on the right page. Only keys valid for the user's role
  // are accepted; unknown hashes are ignored.
  useEffect(() => {
    if (!currentUser) return;
    const items = currentUser.role === "manager" ? NM.filter(n => n.key !== "attendance")
      : currentUser.role === "teamlead" ? NM : NE;
    const valid = new Set(items.map(i => i.key));
    const applyHash = () => {
      const k = window.location.hash.replace(/^#\/?/, "");
      if (valid.has(k)) { setNav(k); setViewEmployee(null); setShowNotif(false); }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const want = "#/" + nav;
    if (window.location.hash !== want) window.history.replaceState(null, "", want);
  }, [nav, currentUser]);


  // Log in via Supabase Auth. If the auth user doesn't exist yet (first-ever
  // login for this employee), auto-sign them up with the given password.
  const login = useCallback(async () => {
    if (!supa) { setLoginError("Backend unavailable"); return; }
    const email = loginId.trim().toLowerCase();
    if (!email.includes("@")) { setLoginError("Please enter your email"); return; }
    if (!loginPassword) { setLoginError("Enter your password"); return; }

    setLoginSubmitting(true);
    setLoginError("");
    try {
      const r = await supa.auth.signInWithPassword({ email, password: loginPassword });
      if (r.error) {
        const msg = (r.error.message || "").toLowerCase();
        // "Email not confirmed" — auth user exists but hasn't clicked the email link yet
        if (msg.includes("not confirmed") || msg.includes("email not confirmed")) {
          setLoginError("Please check your inbox and click the confirmation link, then sign in again.");
          return;
        }
        // "Invalid login credentials" — could be wrong password OR first-time login.
        // Try first-time signup with these credentials.
        const s = await supa.auth.signUp({ email, password: loginPassword });
        if (s.error) {
          setLoginError(s.error.message || "Invalid email or password");
          return;
        }
        // If a session came back, email-confirmation is OFF → onAuthStateChange handles it.
        // Otherwise, Supabase sent a confirmation email; tell the user to check it.
        if (!s.data?.session) {
          setLoginError("We sent a confirmation email to " + email + ". Click the link, then sign in.");
          return;
        }
      }
      setLoginError("");
      // onAuthStateChange will load data and set currentUser
    } finally {
      setLoginSubmitting(false);
    }
  }, [loginId, loginPassword]);

  const logout = useCallback(async () => {
    // Unsubscribe push first so this device stops receiving for the previous user
    try { await unsubscribePush(); } catch {}
    if (supa) { try { await supa.auth.signOut(); } catch {} }
    if (window.__portalChannel) { try { window.__portalChannel.unsubscribe(); } catch {} window.__portalChannel = null; }
    setLoginId(""); setLoginPassword(""); setLoginError(""); setLoginSubmitting(false);
    setNav("dashboard"); setViewEmployee(null);
  }, []);

  const changePassword = useCallback(async (oldPw, newPw) => {
    if (!supa) return false;
    // Verify the old password first by re-authenticating
    const { error } = await supa.auth.signInWithPassword({ email: currentUser.email, password: oldPw });
    if (error) return false;
    const upd = await supa.auth.updateUser({ password: newPw });
    if (upd.error) { console.error(upd.error); return false; }
    setNav("dashboard");
    return true;
  }, [currentUser]);

  const saveProfile = useCallback(u => {
    setEmployees(p => p.map(e => e.id === u.id ? { ...e, ...u } : e));
    if (viewEmployee?.id === u.id) setViewEmployee(p => ({ ...p, ...u }));
    if (currentUser?.id === u.id) setCurrentUser(p => ({ ...p, ...u }));
  }, [viewEmployee, currentUser]);

  // Manager creates an "invite" row. The employee will sign up with this email
  // via Supabase auth and be matched to the row by email in loadPortalData.
  const addInviteEmployee = useCallback(({ email, name, section, designation, role, tier }) => {
    const trimmedEmail = (email || "").trim().toLowerCase();
    if (!trimmedEmail || !name?.trim()) {
      return { ok: false, error: "Email and name are required" };
    }
    if (employees.some(e => e.email?.toLowerCase() === trimmedEmail)) {
      return { ok: false, error: "That email is already registered" };
    }
    const id = nextEmpId(employees, role);
    const newEmp = {
      id,
      email: trimmedEmail,
      name: name.trim(),
      section: section || "",
      designation: designation || "",
      shift: "",
      role: role || "employee",
      profileFinalized: false,
      annualLeave: 30, usedAnnual: 0,
      sickLeave: 15,  usedSick: 0,
      compOff: 0,
      roster: {}, achievements: [], warnings: [], actions: [],
      training: [], documents: [],
      rating: {},
      tier: tier || "",
    };
    setEmployees(p => [...p, newEmp]);
    return { ok: true, id };
  }, [employees]);

  // Bulk invite from a parsed CSV. rows: [{ email, name, section, designation, role, tier }]
  // Returns counts + a per-row outcome list so the UI can show what happened.
  const addInviteEmployeesBulk = useCallback((rows) => {
    const existingByEmail = new Map(
      employees.filter(e => e.email).map(e => [e.email.toLowerCase(), e])
    );
    const acc = [...employees];
    const outcomes = [];

    rows.forEach((row, i) => {
      const email = (row.email || "").trim().toLowerCase();
      const name  = (row.name  || "").trim();
      if (!email || !email.includes("@")) {
        outcomes.push({ line: i + 1, email: row.email, status: "error", reason: "missing or invalid email" });
        return;
      }
      if (!name) {
        outcomes.push({ line: i + 1, email, status: "error", reason: "missing name" });
        return;
      }
      if (existingByEmail.has(email)) {
        outcomes.push({ line: i + 1, email, status: "skipped", reason: "email already exists" });
        return;
      }
      const role = ["employee","teamlead","manager"].includes((row.role || "").toLowerCase())
        ? (row.role || "").toLowerCase() : "employee";
      const tierIn = (row.tier || "").trim().toUpperCase();
      const tier = TIERS_CAP.includes(tierIn) ? tierIn : "";
      const id = nextEmpId(acc, role);
      const newEmp = {
        id, email, name,
        section: row.section || "",
        designation: row.designation || "",
        shift: "",
        role,
        profileFinalized: false,
        annualLeave: 30, usedAnnual: 0,
        sickLeave: 15,  usedSick: 0,
        compOff: 0,
        roster: {}, achievements: [], warnings: [], actions: [],
        training: [], documents: [],
        rating: {},
        tier,
      };
      acc.push(newEmp);
      existingByEmail.set(email, newEmp);
      outcomes.push({ line: i + 1, email, status: "created", id, tier });
    });

    setEmployees(acc);
    return {
      total: rows.length,
      created: outcomes.filter(o => o.status === "created").length,
      skipped: outcomes.filter(o => o.status === "skipped").length,
      errors:  outcomes.filter(o => o.status === "error").length,
      outcomes,
    };
  }, [employees]);

  const addEmployeeAction = useCallback((eid, form) => {
    const item = {
      id: Date.now(), title: form.title, desc: form.desc,
      date: new Date().toISOString().split("T")[0], by: currentUser.name
    };
    const upd = e => {
      if (form.type === "achievement") return { ...e, achievements:[...(e.achievements||[]), item] };
      if (form.type === "warning") return { ...e, warnings:[...(e.warnings||[]), { ...item, severity:"minor" }] };
      return { ...e, actions:[...(e.actions||[]), { ...item, type:form.type }] };
    };
    setEmployees(p => p.map(e => e.id === eid ? upd(e) : e));
    if (viewEmployee?.id === eid) setViewEmployee(p => upd(p));
  }, [currentUser, viewEmployee]);

  const submitLeave = useCallback(form => {
    const id = `LR-${String(nextLrId).padStart(3,"0")}`;
    setNextLrId(p => p + 1);
    setLeaveRequests(p => [{
      id, empId:currentUser.id, empName:currentUser.name, section:currentUser.section || "",
      type:form.type, startDate:form.startDate, endDate:form.endDate, days:form.days, reason:form.reason,
      status:"pending", appliedOn: new Date().toISOString(),
      tlComment:"", mgrComment:"", tlActionDate:"", mgrActionDate:"", tlName:"", mgrName:""
    }, ...p]);
    const lrMsg = `New leave: ${currentUser.name} - ${form.type} (${form.days}d)`;
    setNotifications(p => [{ id: nfId(), to:"TL-001", type:"new_request",
      message: lrMsg, read:false, date:new Date().toISOString()
    }, ...p]);
    sendPush("TL-001", "New Leave Request", lrMsg, "/");
  }, [currentUser, nextLrId]);

  const leaveAction = useCallback((rid, action, comment) => {
    setLeaveRequests(prev => prev.map(r => {
      if (r.id !== rid) return r;
      const now = new Date().toISOString();
      const res = applyLeaveAction(r, currentUser.role, currentUser.name, action, comment, now);
      if (!res) return r;
      setNotifications(p => [{ id: nfId(), ...res.notif, read:false, date:now }, ...p]);
      sendPush(res.push.to, res.push.title, res.push.body, "/");
      return res.updated;
    }));
  }, [currentUser]);

  const editRoster = useCallback((eid, mk, day, newCode) => {
    setEmployees(prev => prev.map(e => {
      if (e.id !== eid) return e;
      const r = (e.roster?.[mk] || []).map(d => d.day === day ? { ...d, code:newCode } : d);
      return { ...e, roster:{ ...e.roster, [mk]:r } };
    }));
  }, []);

  const addDoc = useCallback((eid, doc) => {
    const item = { id:Date.now(), ...doc };
    setEmployees(p => p.map(e => e.id === eid ? { ...e, documents:[...(e.documents||[]), item] } : e));
    if (currentUser?.id === eid) setCurrentUser(p => ({ ...p, documents:[...(p.documents||[]), item] }));
    if (viewEmployee?.id === eid) setViewEmployee(p => ({ ...p, documents:[...(p.documents||[]), item] }));
  }, [currentUser, viewEmployee]);

  const delDoc = useCallback((eid, did) => {
    setEmployees(p => p.map(e => e.id === eid ? { ...e, documents:(e.documents||[]).filter(d => d.id !== did) } : e));
    if (currentUser?.id === eid) setCurrentUser(p => ({ ...p, documents:(p.documents||[]).filter(d => d.id !== did) }));
    if (viewEmployee?.id === eid) setViewEmployee(p => ({ ...p, documents:(p.documents||[]).filter(d => d.id !== did) }));
  }, [currentUser, viewEmployee]);

  const addAnn = useCallback(a => {
    const id = `ANN-${String(nextAnnId).padStart(3,"0")}`;
    setNextAnnId(p => p + 1);
    const newAnn = {
      id, title:a.title, message:a.message, priority:a.priority,
      pinned:a.pinned || false, date:new Date().toISOString(),
      by:currentUser.name, target:a.target || "all"
    };
    setAnnouncements(p => [newAnn, ...p]);
    // Notify all targeted employees
    const targets = a.target === "all"
      ? employees.map(e => e.id)
      : employees.filter(e => e.section === a.target).map(e => e.id);
    setNotifications(p => [
      ...targets.map((eid) => ({ id: nfId(), to:eid, type:"announcement",
        message:`📢 ${a.title}`, read:false, date:new Date().toISOString(), annId:id
      })),
      ...p
    ]);
  }, [nextAnnId, currentUser, employees]);

  const delAnn = useCallback(id => {
    setAnnouncements(p => p.filter(a => a.id !== id));
  }, []);

  const markNotifRead = useCallback(nid => {
    setNotifications(p => p.map(n => n.id === nid ? { ...n, read:true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    if (!currentUser) return;
    setNotifications(p => p.map(n => n.to === currentUser.id ? { ...n, read:true } : n));
  }, [currentUser]);

  const mn = currentUser ? notifications.filter(n => n.to === currentUser.id && !n.read) : [];
  const myNotifs = currentUser ? notifications.filter(n => n.to === currentUser.id) : [];
  const pc = currentUser
    ? (currentUser.role === "teamlead" ? leaveRequests.filter(r => r.status === "pending").length
      : currentUser.role === "manager" ? leaveRequests.filter(r => r.status === "tl_approved").length : 0)
    : 0;

  // LOGIN PAGE
  if (!currentUser) return (
    <LoginPage
      loginId={loginId}
      loginPassword={loginPassword}
      loginError={loginError}
      loginSubmitting={loginSubmitting}
      setLoginId={setLoginId}
      setLoginPassword={setLoginPassword}
      login={login}
    />
  );

  const iM = currentUser.role !== "employee";
  const iMgr = currentUser.role === "manager";
  const isTL = currentUser.role === "teamlead";
  // Manager doesn't see the raw Working Hours roster — that's a TL concern.
  const ni = iMgr ? NM.filter(n => n.key !== "attendance") : iM ? NM : NE;

  // Save an employee's rating (TL or MGR); salary tier editable by MGR only
  const saveRating = (empId, patch) => {
    const apply = e => {
      const prev = e.rating || {};
      const next = { ...prev, ...patch, updatedAt: new Date().toISOString(), updatedBy: currentUser.name };
      if (!iMgr) delete next.tier; // non-managers can't set tier
      return { ...e, rating: next };
    };
    setEmployees(p => p.map(e => e.id === empId ? apply(e) : e));
    if (viewEmployee?.id === empId) setViewEmployee(p => apply(p));
  };
  const rb = currentUser.role === "employee"
    ? { l:"Employee", c:theme.gn }
    : currentUser.role === "teamlead"
      ? { l:"Team Leader", c:theme.yl }
      : { l:"Manager", c:theme.pu };

  if (nav === "changepw") {
    return <ChPw user={currentUser} onCh={changePassword} forced={currentUser.initialPassword} onOut={logout} />;
  }

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:theme.bg }}>
      {/* SIDEBAR */}
      <div style={{
        width: sidebarOpen ? 230 : 56, transition:"width 0.3s",
        background:"rgba(13,31,48,0.95)", borderRight:`1px solid ${theme.bd}`,
        display:"flex", flexDirection:"column", overflow:"hidden", flexShrink:0
      }}>
        <div style={{
          padding: sidebarOpen ? "16px 14px" : "16px 8px", borderBottom:`1px solid ${theme.bd}`,
          display:"flex", alignItems:"center", gap:10,
          justifyContent: sidebarOpen ? "flex-start" : "center"
        }}>
          {sidebarOpen
            ? <Logo size={110} w={true} />
            : <div style={{
                width:30, height:30, borderRadius:8, background:theme.ga,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:10, fontWeight:900, color:"#fff"
              }}>AS</div>
          }
        </div>
        <div style={{ flex:1, padding:"10px 6px", overflowY:"auto" }}>
          {ni.map(it => {
            const isA = nav === it.key;
            const bd2 = it.key === "approvals" && pc > 0;
            return (
              <div key={it.key} onClick={() => { setNav(it.key); setViewEmployee(null); setShowNotif(false); }}
                style={{
                  display:"flex", alignItems:"center", gap:8,
                  padding: sidebarOpen ? "9px 12px" : "9px 0",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                  borderRadius:10, marginBottom:2, cursor:"pointer",
                  background: isA ? "rgba(232,112,42,0.12)" : "transparent",
                  color: isA ? theme.or : theme.td, fontSize:13, position:"relative"
                }}>
                <span style={{ fontSize:16 }}>{it.icon}</span>
                {sidebarOpen && <span style={{ fontWeight: isA ? 700 : 400, fontSize:12 }}>{it.label}</span>}
                {bd2 && <span style={{
                  position:"absolute", top:3, right: sidebarOpen ? 8 : 0,
                  width:16, height:16, borderRadius:"50%",
                  background:theme.rd, color:"#fff", fontSize:8, fontWeight:800,
                  display:"flex", alignItems:"center", justifyContent:"center"
                }}>{pc}</span>}
              </div>
            );
          })}
        </div>
        <div style={{
          padding: sidebarOpen ? "12px 14px" : "12px 6px", borderTop:`1px solid ${theme.bd}`,
          display:"flex", alignItems:"center", gap:8,
          justifyContent: sidebarOpen ? "flex-start" : "center"
        }}>
          <div style={{
            width:30, height:30, borderRadius:10, background:theme.gp,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:11, fontWeight:800, color:"#fff"
          }}>{currentUser.name.split(" ").map(n => n[0]).join("").slice(0,2)}</div>
          {sidebarOpen && (
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ color:theme.tx, fontSize:11, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentUser.name}</div>
              <div style={{ fontSize:9, color:rb.c, fontWeight:700 }}>{rb.l}</div>
            </div>
          )}
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
        <div style={{
          height:52, background:"rgba(13,31,48,0.9)",
          borderBottom:`1px solid ${theme.bd}`,
          display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px",
          position:"sticky", top:0, zIndex:10
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
              background:"none", border:"none", color:theme.td, cursor:"pointer", fontSize:18
            }}>☰</button>
            <h1 style={{ color:theme.tx, fontSize:16, fontWeight:700, margin:0 }}>
              {viewEmployee ? viewEmployee.name : (ni.find(n => n.key === nav)?.label || "")}
            </h1>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, position:"relative" }}>
            <div onClick={() => setShowNotif(!showNotif)} style={{ position:"relative", cursor:"pointer", padding:4 }}>
              <span style={{ fontSize:18 }}>🔔</span>
              {mn.length > 0 && (
                <span style={{
                  position:"absolute", top:-2, right:-4, width:16, height:16, borderRadius:"50%",
                  background:theme.rd, color:"#fff", fontSize:9, fontWeight:800,
                  display:"flex", alignItems:"center", justifyContent:"center"
                }}>{mn.length}</span>
              )}
            </div>
            {showNotif && (
              <NotifPanel
                notifs={myNotifs}
                currentUser={currentUser}
                onClose={() => setShowNotif(false)}
                onMarkRead={markNotifRead}
                onMarkAll={markAllRead}
                onGoTo={(key) => { setNav(key); setViewEmployee(null); setShowNotif(false); }}
              />
            )}
            <Bd text={rb.l} color={rb.c} />
            <button onClick={logout} style={{
              background:theme.card, border:`1px solid ${theme.bd}`, borderRadius:8,
              color:theme.ts, padding:"5px 12px", fontSize:11, cursor:"pointer", fontWeight:600
            }}>Logout</button>
          </div>
        </div>

        <div style={{
          flex:1, padding:20, overflowY:"auto",
          background:"radial-gradient(ellipse at 50% 0%,rgba(21,66,95,0.08) 0%,transparent 50%)"
        }}>
          {viewEmployee ? (
            <div className="fade-in">
              <Bt onClick={() => setViewEmployee(null)} outline={true} small={true}>← Back</Bt>
              <div style={{ marginTop:12 }}>
                <Prof emp={viewEmployee} canEdit={iM} isStaff={iM} isMgr={iMgr} onSave={saveProfile} onAdd={addEmployeeAction} onAddDoc={addDoc} onDelDoc={delDoc} />
              </div>
            </div>
          ) : (
            <div className="fade-in" key={nav}>
              {nav === "dashboard" && (iM
                ? <MDash user={currentUser} employees={employees} leaveRequests={leaveRequests} notifications={notifications} announcements={announcements} pc={pc} onGoTo={setNav} />
                : <EDash user={currentUser} notifications={notifications} announcements={announcements} onGoTo={setNav} />)}
              {nav === "profile" && <Prof emp={currentUser} canEdit={iM || !currentUser.profileFinalized} isStaff={iM} isMgr={iMgr} onSave={saveProfile} onAdd={addEmployeeAction} onAddDoc={addDoc} onDelDoc={delDoc} />}
              {nav === "team" && <Team employees={employees} onSel={setViewEmployee} isMgr={iMgr} isTL={isTL} onInvite={addInviteEmployee} onBulkInvite={addInviteEmployeesBulk} />}
              {nav === "performance" && iM && <Perf employees={employees} onSel={setViewEmployee} isMgr={iMgr} onSave={saveRating} />}
              {nav === "leave" && <LvPg user={currentUser} leaveRequests={leaveRequests} onSub={submitLeave} onAct={leaveAction} />}
              {nav === "approvals" && <ApPg user={currentUser} leaveRequests={leaveRequests} onAct={leaveAction} />}
              {nav === "calendar" && <LeaveCalendar leaveRequests={leaveRequests} employees={employees} />}
              {nav === "attendance" && !iMgr && (iM
                ? <AttPg employees={employees} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} onEditRoster={editRoster} canEdit={iM} />
                : <MyAtt emp={currentUser} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />)}
              {nav === "training" && (iM ? <TrMgmt employees={employees} /> : <MyTr emp={currentUser} />)}
              {nav === "documents" && (iM ? <DocsMgmt employees={employees} onSel={setViewEmployee} /> : <MyDocs emp={currentUser} onAdd={addDoc} onDel={delDoc} />)}
              {nav === "announcements" && <AnnPg user={currentUser} announcements={announcements} employees={employees} onAdd={addAnn} onDel={delAnn} />}
            </div>
          )}
        </div>
      </div>

      {syncError && (
        <div role="alert" style={{
          position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", zIndex:100,
          background:"rgba(30,10,10,0.95)", border:"1px solid rgba(239,68,68,0.5)",
          color:"#fecaca", padding:"10px 16px", borderRadius:12, fontSize:12,
          display:"flex", gap:10, alignItems:"center", boxShadow:"0 8px 30px rgba(0,0,0,0.5)"
        }}>
          ⚠️ {syncError} — your last change may not be saved. Check your connection.
          <button onClick={() => setSyncError("")} aria-label="Dismiss" style={{
            background:"none", border:"none", color:"#fecaca", cursor:"pointer", fontSize:14, fontWeight:700
          }}>✕</button>
        </div>
      )}
    </div>
  );
}


/* ============================================================
   RENDER
   ============================================================ */

const reactRootEl = document.getElementById("root");
if (reactRootEl) {
  const root = ReactDOM.createRoot(reactRootEl);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

// Register service worker for PWA install capability
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}


