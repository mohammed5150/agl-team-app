import { theme, defaultAttMonth } from "./src/constants.js";
import { navItemsForRole } from "./src/nav.js";
import { TIERS_CAP } from "./src/rating.js";
import { INITIAL_EMPLOYEES, INITIAL_LEAVE_REQUESTS, INITIAL_ANNOUNCEMENTS, nfId, INITIAL_NOTIFICATIONS } from "./src/seedData.js";
import { nextEmpId } from "./src/helpers.js";
import { applyLeaveAction, newRequestRecipients } from "./src/leaveWorkflow.js";
import { applyOvertimeAction, newOvertimeRecipients } from "./src/overtimeWorkflow.js";
import { needsOnboarding, sanitizeEmployeeEdit, canFinalizeProfile, isEmailTaken, normalizeLoginId } from "./src/onboarding.js";
import { isApprovedTeamLogin, NOT_REGISTERED_MESSAGE } from "./src/teamDirectory.js";
import { supa, subscribePush, unsubscribePush, sendPush, empToDb, empFromDb, lrToDb, lrFromDb, otToDb, otFromDb, annToDb, annFromDb, nfToDb, nfFromDb, diffById, pushSupported } from "./src/supabasePortal.js";
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
import { OtPg } from "./src/components/OvertimePage.jsx";
import { NotifPanel } from "./src/components/NotifPanel.jsx";
import { Perf } from "./src/components/PerformancePage.jsx";
import { Prof } from "./src/components/Profile.jsx";
import { Onboarding } from "./src/components/Onboarding.jsx";
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
  const [overtimeRequests, setOvertimeRequests] = useState([]);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [announcements, setAnnouncements] = useState(INITIAL_ANNOUNCEMENTS);
  const [nextLrId, setNextLrId] = useState(5);
  const [nextOtId, setNextOtId] = useState(1);
  const [nextAnnId, setNextAnnId] = useState(6);
  const [selectedMonth, setSelectedMonth] = useState(defaultAttMonth());
  const [showNotif, setShowNotif] = useState(false);
  const [syncError, setSyncError] = useState("");
  // "Skip for now" only defers onboarding for this session; it is never persisted.
  const [onboardingSkipped, setOnboardingSkipped] = useState(false);

  // --- Persistence: Supabase Auth + Supabase DB (tables RLS-protected)
  //   Data is only loaded once the user has an authenticated session.
  const LOCAL_KEY = "adb-portal-local-v2";
  const hydrated = useRef(false);
  const prevEmployeesRef     = useRef([]);
  const prevLeaveRequestsRef = useRef([]);
  const prevOvertimeRef      = useRef([]);
  const prevAnnouncementsRef = useRef([]);
  const prevNotificationsRef = useRef([]);
  const loadingRef = useRef(false);
  // Set once the user clears their initial password, so a concurrent data
  // refetch (triggered by the change-password re-auth) can't re-flag them.
  const pwClearedRef = useRef(false);
  // Ensures the URL hash is applied to nav only once per login (deep-link
  // support) and not on every currentUser identity change.
  const hashAppliedRef = useRef(false);

  // Load UI-only state from localStorage immediately
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === "object") {
          if (Array.isArray(d.notifications)) setNotifications(d.notifications);
          if (typeof d.nextLrId === "number") setNextLrId(d.nextLrId);
          if (typeof d.nextOtId === "number") setNextOtId(d.nextOtId);
          if (typeof d.nextAnnId === "number") setNextAnnId(d.nextAnnId);
        }
      }
    } catch (e) { console.warn("[portal] localStorage parse error:", e); }
  }, []);

  // Load all team data from Supabase for an authenticated user
  const loadPortalData = useCallback(async (authEmail) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [empsR, lrsR, otsR, annsR, nfsR] = await Promise.all([
        supa.from("employees").select("*").order("id"),
        supa.from("leave_requests").select("*").order("applied_on", { ascending: false }),
        supa.from("overtime_requests").select("*").order("applied_on", { ascending: false }),
        supa.from("announcements").select("*").order("date", { ascending: false }),
        supa.from("notifications").select("*").order("date", { ascending: false }),
      ]);
      if (empsR.error) console.error("[portal] employees load:", empsR.error);
      if (lrsR.error)  console.error("[portal] leaves load:",    lrsR.error);
      if (otsR.error)  console.error("[portal] overtime load:",  otsR.error);
      if (annsR.error) console.error("[portal] anns load:",      annsR.error);
      if (nfsR.error)  console.error("[portal] notifs load:",    nfsR.error);

      const emps = (empsR.data || []).map(empFromDb);
      const matches = emps.filter(e => e.email?.toLowerCase() === authEmail?.toLowerCase());
      const me = matches[0];
      // If this session just cleared its initial password, don't let a stale
      // DB read (this refetch can race the change) re-flag the user.
      if (me && pwClearedRef.current) {
        me.initialPassword = false;
        const mi = emps.findIndex(e => e.id === me.id);
        if (mi >= 0) emps[mi] = me;
      }
      if (!me) {
        console.warn("[portal] authenticated email has no employee record:", authEmail);
        setLoginError(
          "Your email (" + authEmail + ") is not registered as an employee. Please contact your admin."
        );
        await supa.auth.signOut();
        return;
      }
      const lrs  = (lrsR.data  || []).map(lrFromDb);
      const ots  = (otsR.data  || []).map(otFromDb);
      const anns = (annsR.data || []).map(annFromDb);
      setEmployees(emps);
      setLeaveRequests(lrs);
      setOvertimeRequests(ots);
      setAnnouncements(anns);
      prevEmployeesRef.current     = emps;
      prevLeaveRequestsRef.current = lrs;
      prevOvertimeRef.current      = ots;
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
          .on("postgres_changes", { event: "*", schema: "public", table: "overtime_requests" }, async () => {
            const { data } = await supa.from("overtime_requests").select("*").order("applied_on", { ascending: false });
            if (data) {
              const fresh = data.map(otFromDb);
              prevOvertimeRef.current = fresh;
              setOvertimeRequests(fresh);
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
    } finally {
      loadingRef.current = false;
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
        setOvertimeRequests([]);
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
        notifications, nextLrId, nextOtId, nextAnnId,
      }));
    } catch (e) { console.warn("[portal] localStorage save error:", e); }
  }, [notifications, nextLrId, nextOtId, nextAnnId]);

  // Debounced upsert: only rows that actually changed are pushed.
  // RLS policies restrict each user to writing rows they own/can manage,
  // so bulk-upserting the whole table would be rejected.
  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const baseline = prevEmployeesRef.current;
      const changed = diffById(baseline, employees);
      if (!changed.length) return;
      // Only advance the diff baseline once the write is known to have landed.
      // Advancing it unconditionally drops failed rows out of every future
      // diff, so a rejected write was never retried and local state silently
      // diverged from the database.
      supa.from("employees").upsert(changed.map(empToDb))
        .then(r => {
          if (r.error) { console.error("employees upsert:", r.error); setSyncError("Couldn't save employee changes"); return; }
          if (prevEmployeesRef.current === baseline) prevEmployeesRef.current = employees;
        });
    }, 400);
    return () => clearTimeout(t);
  }, [employees]);

  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const baseline = prevLeaveRequestsRef.current;
      const changed = diffById(baseline, leaveRequests);
      if (!changed.length) return;
      // Only advance the diff baseline once the write is known to have landed.
      // Advancing it unconditionally drops failed rows out of every future
      // diff, so a rejected write was never retried and local state silently
      // diverged from the database.
      supa.from("leave_requests").upsert(changed.map(lrToDb))
        .then(r => {
          if (r.error) { console.error("leave_requests upsert:", r.error); setSyncError("Couldn't save leave request changes"); return; }
          if (prevLeaveRequestsRef.current === baseline) prevLeaveRequestsRef.current = leaveRequests;
        });
    }, 400);
    return () => clearTimeout(t);
  }, [leaveRequests]);

  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const baseline = prevOvertimeRef.current;
      const changed = diffById(baseline, overtimeRequests);
      if (!changed.length) return;
      supa.from("overtime_requests").upsert(changed.map(otToDb))
        .then(r => {
          if (r.error) { console.error("overtime_requests upsert:", r.error); setSyncError("Couldn't save overtime changes"); return; }
          if (prevOvertimeRef.current === baseline) prevOvertimeRef.current = overtimeRequests;
        });
    }, 400);
    return () => clearTimeout(t);
  }, [overtimeRequests]);

  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const baseline = prevAnnouncementsRef.current;
      const changed = diffById(baseline, announcements);
      if (!changed.length) return;
      // Only advance the diff baseline once the write is known to have landed.
      // Advancing it unconditionally drops failed rows out of every future
      // diff, so a rejected write was never retried and local state silently
      // diverged from the database.
      supa.from("announcements").upsert(changed.map(annToDb))
        .then(r => {
          if (r.error) { console.error("announcements upsert:", r.error); setSyncError("Couldn't save announcement changes"); return; }
          if (prevAnnouncementsRef.current === baseline) prevAnnouncementsRef.current = announcements;
        });
    }, 400);
    return () => clearTimeout(t);
  }, [announcements]);

  useEffect(() => {
    if (!hydrated.current || !supa) return;
    const t = setTimeout(() => {
      const baseline = prevNotificationsRef.current;
      const changed = diffById(baseline, notifications);
      if (!changed.length) return;
      // Only advance the diff baseline once the write is known to have landed.
      // Advancing it unconditionally drops failed rows out of every future
      // diff, so a rejected write was never retried and local state silently
      // diverged from the database.
      supa.from("notifications").upsert(changed.map(nfToDb))
        .then(r => {
          if (r.error) { console.error("notifications upsert:", r.error); setSyncError("Couldn't save notification changes"); return; }
          if (prevNotificationsRef.current === baseline) prevNotificationsRef.current = notifications;
        });
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
  //
  // Apply the incoming hash to nav exactly ONCE per login (deep-link / refresh
  // support). Keyed on the user id, and guarded so it never re-fires when the
  // currentUser object is merely replaced (profile save, initial-password flip)
  // — which previously bounced the user back to a stale hash and closed panels.
  useEffect(() => {
    if (!currentUser || hashAppliedRef.current) return;
    hashAppliedRef.current = true;
    const valid = new Set(navItemsForRole(currentUser.role).map(i => i.key));
    const k = window.location.hash.replace(/^#\/?/, "");
    if (valid.has(k)) setNav(k);
  }, [currentUser]);

  // Reset the once-per-login guard when the user signs out.
  useEffect(() => { if (!currentUser) hashAppliedRef.current = false; }, [currentUser]);

  // Respond to real hashchange events (browser back/forward, manual edits).
  // Keyed on role (a string), so replacing the currentUser object does not
  // re-attach the listener or trigger navigation side effects.
  useEffect(() => {
    const role = currentUser?.role;
    if (!role) return;
    const valid = new Set(navItemsForRole(role).map(i => i.key));
    const onHashChange = () => {
      const k = window.location.hash.replace(/^#\/?/, "");
      if (valid.has(k)) { setNav(k); setViewEmployee(null); setShowNotif(false); }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [currentUser?.role]);

  useEffect(() => {
    if (!currentUser) return;
    const want = "#/" + nav;
    if (window.location.hash !== want) window.history.replaceState(null, "", want);
  }, [nav, currentUser]);


  // Log in via Supabase Auth. If the auth user doesn't exist yet (first-ever
  // login for this employee), auto-sign them up with the given password.
  const login = useCallback(async () => {
    if (!supa) { setLoginError("Backend unavailable"); return; }
    const email = normalizeLoginId(loginId);
    if (!email.includes("@")) { setLoginError("Please enter your email"); return; }
    if (!loginPassword) { setLoginError("Enter your password"); return; }

    // Eligibility gate — runs BEFORE any Supabase call. Previously a failed
    // sign-in fell straight through to auth.signUp(), so typing any address
    // minted an auth user for it. Only approved Team Mail IDs get that far now.
    // This cannot read the employees table: there is no session yet and RLS
    // denies anonymous select, which is why the approved list is static.
    if (!isApprovedTeamLogin(email)) {
      setLoginError(NOT_REGISTERED_MESSAGE);
      return;
    }

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
        // "Invalid login credentials" — wrong password, or an approved member
        // signing in for the first time. Account creation is reachable only for
        // addresses that passed the gate above, so this can no longer mint an
        // account for an arbitrary address.
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
    try { await unsubscribePush(); } catch (e) { console.warn("[logout] push unsubscribe:", e); }
    if (supa) { try { await supa.auth.signOut(); } catch (e) { console.warn("[logout] signOut:", e); } }
    if (window.__portalChannel) { try { window.__portalChannel.unsubscribe(); } catch (e) { console.warn("[logout] channel unsubscribe:", e); } window.__portalChannel = null; }
    setLoginId(""); setLoginPassword(""); setLoginError(""); setLoginSubmitting(false);
    setNav("dashboard"); setViewEmployee(null);
    // Clear the route hash so the next user on this device starts on the
    // dashboard instead of inheriting the previous user’s view.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  const changePassword = useCallback(async (oldPw, newPw) => {
    if (!supa) return false;
    // Verify the old password first by re-authenticating
    const { error } = await supa.auth.signInWithPassword({ email: currentUser.email, password: oldPw });
    if (error) return false;
    const upd = await supa.auth.updateUser({ password: newPw });
    if (upd.error) { console.error(upd.error); return false; }
    // Persist the cleared flag directly. The re-auth above fires an auth event
    // that refetches employees; relying on the debounced upsert would lose the
    // race (the refetch resets the diff baseline before it runs). The ref makes
    // the concurrent refetch preserve the cleared value too.
    pwClearedRef.current = true;
    const dbw = await supa.from("employees").update({ initial_password: false }).eq("id", currentUser.id);
    if (dbw.error) console.error("[pw] clear initial flag:", dbw.error);
    setEmployees(p => p.map(e => e.id === currentUser.id ? { ...e, initialPassword: false } : e));
    setCurrentUser(p => ({ ...p, initialPassword: false }));
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
    if (isEmailTaken(employees, trimmedEmail)) {
      return { ok: false, error: "That email is already registered" };
    }
    // The login gate only admits approved Team Mail IDs, so creating a row for
    // any other address would produce an employee who can never sign in. Refuse
    // it here rather than leave a locked-out record behind.
    if (!isApprovedTeamLogin(trimmedEmail)) {
      return {
        ok: false,
        error: "That email is not on the approved Team Mail ID list, so it could "
             + "not sign in. Add it to src/teamDirectory.js first.",
      };
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
      initialPassword: true,
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
      if (existingByEmail.has(email) || isEmailTaken(acc, email)) {
        outcomes.push({ line: i + 1, email, status: "skipped", reason: "email already exists" });
        return;
      }
      if (!isApprovedTeamLogin(email)) {
        outcomes.push({ line: i + 1, email, status: "error", reason: "not an approved Team Mail ID" });
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
        initialPassword: true,
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
    // Team leads review employee requests; a team lead's own request goes
    // straight to the managers.
    let recipients = newRequestRecipients(currentUser.role, employees);
    // Fallback: if the intended approver role has no members, notify any staff
    // so a request is never silently lost.
    if (!recipients.length) {
      recipients = employees.filter(e => e.role === "teamlead" || e.role === "manager").map(e => e.id);
    }
    if (recipients.length) {
      const date = new Date().toISOString();
      setNotifications(p => [
        ...recipients.map(rid => ({ id: nfId(), to:rid, type:"new_request", message: lrMsg, read:false, date })),
        ...p,
      ]);
      recipients.forEach(rid => sendPush(rid, "New Leave Request", lrMsg, "/"));
    } else {
      console.warn("[leave] no teamlead/manager to notify for request", id);
      setSyncError("Leave submitted, but no approver is configured to be notified.");
    }
  }, [currentUser, nextLrId, employees]);

  const leaveAction = useCallback((rid, action, comment) => {
    const managerIds = employees.filter(e => e.role === "manager").map(e => e.id);
    const req = leaveRequests.find(r => r.id === rid);
    if (!req) return;
    const now = new Date().toISOString();
    const res = applyLeaveAction(req, currentUser, action, comment, now, managerIds);
    if (!res) return;
    // Pure state update — side effects (notifs/pushes) run once, outside the
    // updater, so a replayed render can't duplicate them.
    setLeaveRequests(prev => prev.map(r => r.id === rid ? res.updated : r));
    if (res.notifs.length) {
      setNotifications(p => [
        ...res.notifs.map(n => ({ id: nfId(), ...n, read:false, date:now })),
        ...p,
      ]);
    }
    res.pushes.forEach(pu => sendPush(pu.to, pu.title, pu.body, "/"));
  }, [currentUser, employees, leaveRequests]);

  const submitOvertime = useCallback(form => {
    const id = `OT-${String(nextOtId).padStart(3,"0")}`;
    setNextOtId(p => p + 1);
    setOvertimeRequests(p => [{
      id, empId:currentUser.id, empName:currentUser.name, section:currentUser.section || "",
      workDate:form.workDate, hours:form.hours, reason:form.reason,
      status:"pending", appliedOn: new Date().toISOString(),
      tlComment:"", tlActionDate:"", tlName:"", compOffDays:0
    }, ...p]);
    const msg = `New overtime: ${currentUser.name} - ${form.hours}h on ${form.workDate}`;
    // Overtime stops at the team lead, so only team leads are notified. If
    // there is none configured, fall back to managers so it is never lost.
    let recipients = newOvertimeRecipients(employees);
    if (!recipients.length) {
      recipients = employees.filter(e => e.role === "manager").map(e => e.id);
    }
    if (recipients.length) {
      const date = new Date().toISOString();
      setNotifications(p => [
        ...recipients.map(rid => ({ id: nfId(), to:rid, type:"new_request", message: msg, read:false, date })),
        ...p,
      ]);
      recipients.forEach(rid => sendPush(rid, "New Overtime Request", msg, "/"));
    } else {
      console.warn("[overtime] no teamlead to notify for request", id);
      setSyncError("Overtime submitted, but no approver is configured to be notified.");
    }
  }, [currentUser, nextOtId, employees]);

  const overtimeAction = useCallback((rid, action, comment) => {
    const req = overtimeRequests.find(r => r.id === rid);
    if (!req) return;
    const now = new Date().toISOString();
    const res = applyOvertimeAction(req, currentUser, action, comment, now);
    if (!res) return;
    setOvertimeRequests(prev => prev.map(r => r.id === rid ? res.updated : r));
    if (res.notifs.length) {
      setNotifications(p => [
        ...res.notifs.map(n => ({ id: nfId(), ...n, read:false, date:now })),
        ...p,
      ]);
    }
    res.pushes.forEach(pu => sendPush(pu.to, pu.title, pu.body, "/"));
  }, [currentUser, overtimeRequests]);

  // Employee saving their own onboarding draft. sanitizeEmployeeEdit drops
  // anything outside the editable allowlist and refuses once finalized — the
  // database enforces the same rules (guard_employee_profile_lock).
  const saveOwnProfile = useCallback(patch => {
    if (!currentUser) return;
    const clean = sanitizeEmployeeEdit(currentUser, patch);
    if (!Object.keys(clean).length) return;
    setEmployees(p => p.map(e => e.id === currentUser.id ? { ...e, ...clean } : e));
    setCurrentUser(p => ({ ...p, ...clean }));
  }, [currentUser]);

  // Finalize: save the last edits, then flip the lock. One-way for an
  // employee — only a manager can reopen it afterwards.
  const finalizeOwnProfile = useCallback(patch => {
    if (!currentUser) return;
    const clean = sanitizeEmployeeEdit(currentUser, patch || {});
    const next = { ...currentUser, ...clean };
    if (!canFinalizeProfile(currentUser, next)) return;
    const done = { ...clean, profileFinalized: true };
    setEmployees(p => p.map(e => e.id === currentUser.id ? { ...e, ...done } : e));
    setCurrentUser(p => ({ ...p, ...done }));
    setNav("dashboard");
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
  const ni = navItemsForRole(currentUser.role);

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

  // Force a password change on first login before anything else is reachable.
  // Enforced at render (not by scattered nav checks) so no route bypasses it.
  if (currentUser.initialPassword) {
    return <ChPw onCh={changePassword} forced={true} onOut={logout} />;
  }

  // First login with a password already set: send the user through profile
  // setup before the dashboard. Rendered at the same level as the password
  // gate so no route can bypass it. "Skip for now" defers it for this session
  // only — nothing about the skip is persisted.
  if (needsOnboarding(currentUser) && !onboardingSkipped && nav !== "changepw") {
    return (
      <Onboarding
        emp={currentUser}
        onSave={saveOwnProfile}
        onFinalize={finalizeOwnProfile}
        onSkip={() => setOnboardingSkipped(true)}
      />
    );
  }

  if (nav === "changepw") {
    return <ChPw onCh={changePassword} forced={currentUser.initialPassword} onOut={logout} />;
  }

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:theme.bg }}>
      {/* SIDEBAR */}
      <nav aria-label="Main navigation" style={{
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
          <div aria-label={`Avatar for ${currentUser.name}`} role="img" style={{
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
      </nav>

      {/* MAIN */}
      <main style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
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
                <Prof emp={viewEmployee} actor={currentUser} canEdit={iM} isStaff={iM} isMgr={iMgr} onSave={saveProfile} onAdd={addEmployeeAction} onAddDoc={addDoc} onDelDoc={delDoc} />
              </div>
            </div>
          ) : (
            <div className="fade-in" key={nav}>
              {nav === "dashboard" && (iM
                ? <MDash user={currentUser} employees={employees} leaveRequests={leaveRequests} announcements={announcements} pc={pc} onGoTo={setNav} />
                : <EDash user={currentUser} announcements={announcements} onGoTo={setNav} />)}
              {nav === "profile" && <Prof emp={currentUser} actor={currentUser} canEdit={iM || !currentUser.profileFinalized} isStaff={iM} isMgr={iMgr} onSave={saveProfile} onAdd={addEmployeeAction} onAddDoc={addDoc} onDelDoc={delDoc} />}
              {nav === "team" && <Team employees={employees} onSel={setViewEmployee} isMgr={iMgr} isTL={isTL} onInvite={addInviteEmployee} onBulkInvite={addInviteEmployeesBulk} />}
              {nav === "performance" && iM && <Perf employees={employees} onSel={setViewEmployee} isMgr={iMgr} onSave={saveRating} />}
              {nav === "leave" && <LvPg user={currentUser} leaveRequests={leaveRequests} onSub={submitLeave} onAct={leaveAction} />}
              {nav === "overtime" && <OtPg user={currentUser} overtimeRequests={overtimeRequests} onSub={submitOvertime} onAct={overtimeAction} />}
              {nav === "approvals" && <ApPg user={currentUser} leaveRequests={leaveRequests} onAct={leaveAction} />}
              {nav === "calendar" && <LeaveCalendar leaveRequests={leaveRequests} />}
              {nav === "attendance" && !iMgr && (iM
                ? <AttPg employees={employees} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} onEditRoster={editRoster} canEdit={iM} />
                : <MyAtt emp={currentUser} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />)}
              {nav === "training" && (iM ? <TrMgmt employees={employees} /> : <MyTr emp={currentUser} />)}
              {nav === "documents" && (iM ? <DocsMgmt employees={employees} onSel={setViewEmployee} /> : <MyDocs emp={currentUser} onAdd={addDoc} onDel={delDoc} />)}
              {nav === "announcements" && <AnnPg user={currentUser} announcements={announcements} onAdd={addAnn} onDel={delAnn} />}
            </div>
          )}
        </div>
      </main>

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
    navigator.serviceWorker.register("sw.js").catch((e) => { console.warn("[sw] registration failed:", e); });
  });
}


