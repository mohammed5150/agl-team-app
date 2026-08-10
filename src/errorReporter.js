// Front-end error reporting.
//
// WHY THIS EXISTS
// When the portal broke for someone, nobody found out. The ErrorBoundary
// showed a friendly message and console.error went to a phone nobody reads. An
// operations team on shift will not file a bug report — they will work around
// it, and the workaround becomes the process. This turns "the portal is being
// weird" into a row with a stack trace and a count.
//
// FIRST RULE: NEVER MAKE THINGS WORSE
// Every function here swallows its own failures. An error reporter that throws
// inside an error handler is a fault multiplier, and one that blocks a render
// to await a network call has turned a cosmetic bug into an outage. Nothing
// here is awaited by the app, and nothing here can throw into it.
//
// PRIVACY
// Reports go to the same Supabase project the portal already talks to, under
// RLS (insert for employees, select for managers). The reporter's identity is
// stamped SERVER-SIDE by a trigger, so nothing here needs to send it — and a
// misbehaving client cannot misattribute its errors. The route is the app's
// own nav key ('leave', 'approvals'), never a URL, because the hash carries
// employee ids.

const MAX_QUEUE = 20;
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

let client = null;
let currentRoute = "";
let installed = false;
// Fingerprints already reported this page load. Without this, one fault in a
// render loop files the same report until the rate limiter cuts it off — the
// server-side cap is the backstop, this is the cheap first line.
const seen = new Set();
let sentThisLoad = 0;

/**
 * Stable identifier for "the same fault", so repeats collapse into a count
 * rather than a wall. Built from the kind, the message, and the first stack
 * frame — the frame is what separates two different faults with the same
 * generic message ("Cannot read properties of undefined").
 */
export function fingerprint(kind, message, stack) {
  const frame = String(stack || "")
    .split("\n")
    .map(l => l.trim())
    .find(l => l.startsWith("at ")) || "";
  // Strip the origin and any line:col numbers, so the same fault fingerprints
  // identically across deploys and browsers.
  const normalisedFrame = frame
    .replace(/https?:\/\/[^\s)]+/g, "")
    .replace(/:\d+:\d+/g, "");
  const basis = `${kind}|${String(message).slice(0, 200)}|${normalisedFrame}`;

  // FNV-1a. Not cryptographic — this only needs to be stable and cheap.
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Strip anything that looks like an email out of free text. */
function scrub(text) {
  return String(text || "")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");
}

/**
 * File one report. Fire-and-forget by design — callers must not await it.
 *
 * @param {object} report { kind, message, stack, component }
 */
export function reportError(report) {
  try {
    const kind = ["error", "unhandled_rejection", "render", "sync"].includes(report?.kind)
      ? report.kind : "error";
    const message = scrub(report?.message || "Unknown error");
    const stack = scrub(report?.stack);
    const fp = fingerprint(kind, message, stack);

    // Already reported this fault on this page load, or the page has filed
    // enough. Both caps are local; the trigger applies the durable one.
    if (seen.has(fp) || sentThisLoad >= MAX_QUEUE) return;
    seen.add(fp);
    sentThisLoad += 1;

    // Always leave a console trace, so a developer with the tab open sees it
    // regardless of whether the network call lands.
    console.error(`[portal:${kind}]`, message, report?.stack || "");

    if (!client) return;

    const row = {
      kind,
      message,
      stack: stack || null,
      component: report?.component || null,
      route: currentRoute || null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      app_version: APP_VERSION,
      fingerprint: fp,
      // emp_id / email / role are deliberately absent: the database stamps
      // them from the session. Sending them would be both redundant and
      // forgeable.
    };

    // Not awaited, and the rejection is swallowed. A failed report must be
    // invisible to the user — they already have one problem.
    const p = client.from("client_errors").insert(row);
    if (p && typeof p.then === "function") {
      p.then(r => { if (r?.error) console.warn("[portal] error report rejected:", r.error.message); })
       .catch(() => {});
    }
  } catch (e) {
    // Reporting must never throw into the caller.
    try { console.warn("[portal] error reporter failed:", e); } catch { /* nothing left to do */ }
  }
}

/** Tell the reporter which page the user is on. */
export function setRoute(route) {
  currentRoute = typeof route === "string" ? route.slice(0, 64) : "";
}

/**
 * Attach global handlers.
 *
 * Called once, after the Supabase client exists. Returns a teardown function
 * so tests (and a hot reload) can detach cleanly.
 */
export function installErrorReporting(supabaseClient, { target = typeof window !== "undefined" ? window : null } = {}) {
  client = supabaseClient || null;
  if (!target || installed) return () => {};
  installed = true;

  const onError = (event) => {
    reportError({
      kind: "error",
      message: event?.message || String(event?.error || "Unknown error"),
      stack: event?.error?.stack,
    });
  };

  const onRejection = (event) => {
    const reason = event?.reason;
    reportError({
      kind: "unhandled_rejection",
      message: reason?.message || String(reason || "Unhandled promise rejection"),
      stack: reason?.stack,
    });
  };

  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);

  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
    installed = false;
  };
}

/** Test seam: forget what has been reported on this page load. */
export function resetReporter() {
  seen.clear();
  sentThisLoad = 0;
  installed = false;
  client = null;
  currentRoute = "";
}
