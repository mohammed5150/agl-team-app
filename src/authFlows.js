// Password reset and account recovery, kept out of the component tree so the
// rules are testable without a browser.
//
// WHY THIS EXISTS
// The portal had no way back in. A member who forgot their password — or a
// new joiner who set one on the sign-up path and mistyped it — was locked out
// with no self-service route, and the only recovery was an administrator
// editing Supabase Auth by hand. That is the single most common real-world
// auth failure and it had no answer here.
//
// SHAPE OF THE FLOW
//   1. requestPasswordReset  — user asks from the login screen. The address is
//      checked against the approved-login gate first, then Supabase emails a
//      recovery link.
//   2. Supabase redirects back to the portal with a recovery token in the URL
//      hash. supabase-js consumes it and fires PASSWORD_RECOVERY; app.jsx
//      renders the reset screen instead of the dashboard.
//   3. completePasswordReset — sets the new password on that recovery session.
//
// ENUMERATION
// requestPasswordReset reports the SAME outcome whether or not the address has
// an account, so the form cannot be used to discover who is registered. The
// approved-list gate is the one exception, and it is unavoidable: it already
// answers that question on the sign-in path by design, and its answer is about
// the published team roster rather than about who has signed up.

import { checkApprovedTeamLogin, NOT_REGISTERED_MESSAGE } from "./teamDirectory.js";
import { normalizeLoginId } from "./onboarding.js";
import { checkPassword } from "./passwordPolicy.js";

/** Shown for every non-refused outcome, so nothing leaks about the account. */
export const RESET_SENT_MESSAGE =
  "If that address has a Team Portal account, a password reset link is on its "
  + "way. The link expires in one hour — check your spam folder if it does not "
  + "arrive within a few minutes.";

export const RESET_RATE_LIMITED_MESSAGE =
  "A reset link was requested for that address recently. Please wait a minute "
  + "before asking for another one.";

/**
 * Where Supabase should send the user back to. Deliberately the app's own
 * origin + path with no hash: supabase-js appends the recovery token itself,
 * and carrying a stale `#/leave` through would fight the app's hash router.
 */
export function resetRedirectUrl(loc = typeof window !== "undefined" ? window.location : null) {
  if (!loc) return undefined;
  return `${loc.origin}${loc.pathname}`;
}

/**
 * Ask Supabase to email a recovery link.
 *
 * Returns { ok, message, refused } — `refused` is true only when the address
 * is not an approved Team Mail ID, which is the one case where saying so is
 * both safe and useful.
 */
export async function requestPasswordReset(supa, email, opts = {}) {
  const addr = normalizeLoginId(email);
  if (!addr.includes("@")) {
    return { ok: false, refused: true, message: "Enter your team email address" };
  }
  if (!supa) {
    return { ok: false, refused: false, message: "Backend unavailable — try again shortly" };
  }

  const { approved } = await checkApprovedTeamLogin(supa, addr);
  // `approved` is null when the check could not be made at all (no embedded
  // directory and the RPC unreachable). Send anyway: Supabase will simply not
  // deliver mail to an address with no account, and refusing here would lock
  // out the whole team the moment the RPC hiccups.
  if (approved === false) {
    return { ok: false, refused: true, message: NOT_REGISTERED_MESSAGE };
  }

  const { error } = await supa.auth.resetPasswordForEmail(addr, {
    redirectTo: opts.redirectTo ?? resetRedirectUrl(),
  });

  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("rate limit") || msg.includes("too many") || error.status === 429) {
      return { ok: false, refused: false, message: RESET_RATE_LIMITED_MESSAGE };
    }
    // Any other failure is reported as success on purpose: distinguishing
    // "no such user" from "sent" is exactly the enumeration this avoids.
    console.warn("[auth] reset request failed:", error);
  }
  return { ok: true, refused: false, message: RESET_SENT_MESSAGE };
}

/**
 * Set a new password on the recovery session Supabase established from the
 * emailed link. Enforces the shared policy before the round trip.
 */
export async function completePasswordReset(supa, newPassword, identity = {}) {
  if (!supa) return { ok: false, message: "Backend unavailable — try again shortly" };

  const check = checkPassword(newPassword, identity);
  if (!check.ok) return { ok: false, message: check.error };

  const { error } = await supa.auth.updateUser({ password: newPassword });
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("session") || msg.includes("jwt") || msg.includes("expired")) {
      return {
        ok: false,
        expired: true,
        message: "That reset link has expired. Request a new one from the sign-in page.",
      };
    }
    if (msg.includes("should be different") || msg.includes("same as")) {
      return { ok: false, message: "Choose a password you have not used before" };
    }
    return { ok: false, message: error.message || "Could not set your new password" };
  }
  return { ok: true, message: "Password updated. Signing you in…" };
}

/**
 * Is the current page load a password-recovery landing?
 *
 * supabase-js consumes and clears the token hash when detectSessionInUrl is on,
 * which can happen before React mounts — so the hash alone is not reliable.
 * app.jsx therefore ALSO listens for the PASSWORD_RECOVERY auth event; this
 * function covers the case where the hash is still present on first paint.
 */
export function isRecoveryLanding(hash = typeof window !== "undefined" ? window.location.hash : "") {
  const h = String(hash || "");
  if (!h) return false;
  return /(^|[#&?])type=recovery(&|$)/.test(h);
}

/**
 * Manager-initiated reset: send a recovery email on someone else's behalf.
 *
 * Uses the same public endpoint rather than the admin API — the service_role
 * key required by admin.generateLink() must never reach the browser. The
 * manager therefore triggers exactly what the user could have triggered
 * themselves, which is the whole intent.
 */
export async function sendResetForEmployee(supa, employee, opts = {}) {
  if (!employee?.email) {
    return { ok: false, message: "That employee has no email address on file" };
  }
  const r = await requestPasswordReset(supa, employee.email, opts);
  if (r.refused) return { ok: false, message: r.message };
  return {
    ok: true,
    message: `Reset link sent to ${employee.email}. It expires in one hour.`,
  };
}

// ---------------------------------------------------------------
// Sign-in throttling
// ---------------------------------------------------------------

/**
 * Client-side backoff after repeated failures for one address.
 *
 * Supabase applies its own server-side rate limit, which is the real control.
 * This exists so a person hammering a half-remembered password gets told to
 * slow down rather than silently tripping the server limit and being told
 * something misleading, and so a script in a hijacked tab is slowed at all.
 */
const FAILURE_THRESHOLD = 5;
const LOCKOUT_MS = 60_000;

export function createLoginThrottle({ threshold = FAILURE_THRESHOLD, lockoutMs = LOCKOUT_MS } = {}) {
  const failures = new Map(); // email -> { count, until }

  return {
    /** ms remaining before this address may try again; 0 when clear. */
    retryAfter(email, now = Date.now()) {
      const rec = failures.get(normalizeLoginId(email));
      if (!rec || !rec.until || rec.until <= now) return 0;
      return rec.until - now;
    },
    recordFailure(email, now = Date.now()) {
      const key = normalizeLoginId(email);
      const rec = failures.get(key) || { count: 0, until: 0 };
      rec.count += 1;
      if (rec.count >= threshold) {
        // Each further failure past the threshold doubles the wait, capped so
        // a genuine user is never locked out for more than a few minutes.
        const step = rec.count - threshold;
        rec.until = now + Math.min(lockoutMs * Math.pow(2, step), 8 * lockoutMs);
      }
      failures.set(key, rec);
      return rec;
    },
    recordSuccess(email) {
      failures.delete(normalizeLoginId(email));
    },
    reset() { failures.clear(); },
  };
}

/** Wording for a throttled attempt. */
export function throttleMessage(msRemaining) {
  const secs = Math.ceil(msRemaining / 1000);
  if (secs <= 60) return `Too many failed attempts. Try again in ${secs} seconds.`;
  return `Too many failed attempts. Try again in ${Math.ceil(secs / 60)} minutes.`;
}
