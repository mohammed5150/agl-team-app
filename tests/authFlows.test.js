import { describe, it, expect, vi } from "vitest";
import {
  requestPasswordReset, completePasswordReset, isRecoveryLanding,
  resetRedirectUrl, sendResetForEmployee,
  createLoginThrottle, throttleMessage,
  RESET_SENT_MESSAGE, RESET_RATE_LIMITED_MESSAGE,
} from "../src/authFlows.js";
import { NOT_REGISTERED_MESSAGE } from "../src/teamDirectory.js";

const APPROVED = "nisar.ahmed@adbsafegate.com";
const UNKNOWN  = "attacker@example.com";
const GOOD_PW  = "Kx7#mQvz2Lpr";

/** Minimal Supabase double: an approval RPC plus the auth methods used here. */
function fakeSupa({ approve = true, resetError = null, updateError = null } = {}) {
  const calls = { reset: [], update: [] };
  return {
    calls,
    rpc: async () => ({ data: approve, error: null }),
    auth: {
      resetPasswordForEmail: async (email, opts) => {
        calls.reset.push({ email, opts });
        return { error: resetError };
      },
      updateUser: async (attrs) => {
        calls.update.push(attrs);
        return { error: updateError };
      },
    },
  };
}

describe("requesting a reset link", () => {
  it("emails the link for an approved address", async () => {
    const supa = fakeSupa();
    const r = await requestPasswordReset(supa, APPROVED, { redirectTo: "https://portal.test/" });
    expect(r.ok).toBe(true);
    expect(r.message).toBe(RESET_SENT_MESSAGE);
    expect(supa.calls.reset).toEqual([
      { email: APPROVED, opts: { redirectTo: "https://portal.test/" } },
    ]);
  });

  it("normalises the address before sending", async () => {
    const supa = fakeSupa();
    await requestPasswordReset(supa, "  NISAR.Ahmed@AdbSafegate.com ", { redirectTo: "x" });
    expect(supa.calls.reset[0].email).toBe(APPROVED);
  });

  it("refuses an address the database says is not approved", async () => {
    const supa = fakeSupa({ approve: false });
    const r = await requestPasswordReset(supa, UNKNOWN, { redirectTo: "x" });
    expect(r).toMatchObject({ ok: false, refused: true, message: NOT_REGISTERED_MESSAGE });
    expect(supa.calls.reset).toEqual([]);
  });

  it("asks for an address before doing anything", async () => {
    const supa = fakeSupa();
    const r = await requestPasswordReset(supa, "not-an-email", { redirectTo: "x" });
    expect(r.ok).toBe(false);
    expect(r.refused).toBe(true);
    expect(supa.calls.reset).toEqual([]);
  });

  describe("the outcome does not reveal whether an account exists", () => {
    // Enumeration is the whole risk of a reset form: if "no such user" looked
    // different from "sent", the form would list who is registered.
    it("reports success even when Supabase reports a failure", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const supa = fakeSupa({ resetError: { message: "User not found", status: 400 } });
      const r = await requestPasswordReset(supa, APPROVED, { redirectTo: "x" });
      expect(r.ok).toBe(true);
      expect(r.message).toBe(RESET_SENT_MESSAGE);
      warn.mockRestore();
    });

    it("gives the same message for an account that does exist", async () => {
      const supa = fakeSupa();
      const hit = await requestPasswordReset(supa, APPROVED, { redirectTo: "x" });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const miss = await requestPasswordReset(
        fakeSupa({ resetError: { message: "User not found" } }), APPROVED, { redirectTo: "x" });
      warn.mockRestore();
      expect(hit.message).toBe(miss.message);
    });
  });

  it("says so plainly when Supabase rate-limits the request", async () => {
    const supa = fakeSupa({ resetError: { message: "Email rate limit exceeded", status: 429 } });
    const r = await requestPasswordReset(supa, APPROVED, { redirectTo: "x" });
    expect(r.ok).toBe(false);
    expect(r.message).toBe(RESET_RATE_LIMITED_MESSAGE);
  });

  it("reports a missing backend rather than pretending it sent", async () => {
    const r = await requestPasswordReset(null, APPROVED);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/unavailable/i);
  });
});

describe("completing a reset", () => {
  it("sets the new password when it meets the policy", async () => {
    const supa = fakeSupa();
    const r = await completePasswordReset(supa, GOOD_PW);
    expect(r.ok).toBe(true);
    expect(supa.calls.update).toEqual([{ password: GOOD_PW }]);
  });

  it("enforces the shared policy before the round trip", async () => {
    const supa = fakeSupa();
    const r = await completePasswordReset(supa, "Abc123");
    expect(r.ok).toBe(false);
    expect(supa.calls.update).toEqual([]);
  });

  it("refuses a password containing the user's own address", async () => {
    const supa = fakeSupa();
    const r = await completePasswordReset(supa, "Nisar#2026xyzQ", { email: APPROVED });
    expect(r.ok).toBe(false);
    expect(supa.calls.update).toEqual([]);
  });

  it("explains an expired link and points back to the sign-in page", async () => {
    const supa = fakeSupa({ updateError: { message: "JWT expired" } });
    const r = await completePasswordReset(supa, GOOD_PW);
    expect(r.ok).toBe(false);
    expect(r.expired).toBe(true);
    expect(r.message).toMatch(/expired/i);
  });

  it("passes any other failure through", async () => {
    const supa = fakeSupa({ updateError: { message: "Something broke" } });
    const r = await completePasswordReset(supa, GOOD_PW);
    expect(r).toMatchObject({ ok: false, message: "Something broke" });
  });
});

describe("recognising a recovery landing", () => {
  it.each([
    "#access_token=abc&type=recovery",
    "#type=recovery&access_token=abc",
    "#type=recovery",
  ])("recognises %s", hash => {
    expect(isRecoveryLanding(hash)).toBe(true);
  });

  it.each([
    "", "#/leave", "#/dashboard", "#access_token=abc&type=signup",
    "#type=recovery_other",
  ])("does not mistake %j for a recovery landing", hash => {
    expect(isRecoveryLanding(hash)).toBe(false);
  });
});

describe("the redirect target", () => {
  it("is the app's own origin and path, with no hash", () => {
    const loc = { origin: "https://portal.test", pathname: "/", hash: "#/leave" };
    expect(resetRedirectUrl(loc)).toBe("https://portal.test/");
  });

  it("is undefined with no location, so Supabase uses its configured default", () => {
    expect(resetRedirectUrl(null)).toBeUndefined();
  });
});

describe("a manager sending a reset on someone's behalf", () => {
  it("sends to that employee's address and names it back", async () => {
    const supa = fakeSupa();
    const r = await sendResetForEmployee(supa, { id: "EMP-019", email: APPROVED }, { redirectTo: "x" });
    expect(r.ok).toBe(true);
    expect(r.message).toContain(APPROVED);
    expect(supa.calls.reset[0].email).toBe(APPROVED);
  });

  it("refuses an employee with no address on file", async () => {
    const r = await sendResetForEmployee(fakeSupa(), { id: "EMP-020" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/no email address/i);
  });

  it("surfaces a refusal from the approval gate", async () => {
    const supa = fakeSupa({ approve: false });
    const r = await sendResetForEmployee(supa, { id: "X", email: UNKNOWN }, { redirectTo: "x" });
    expect(r.ok).toBe(false);
    expect(supa.calls.reset).toEqual([]);
  });
});

describe("sign-in throttling", () => {
  it("allows attempts up to the threshold", () => {
    const t = createLoginThrottle({ threshold: 3, lockoutMs: 1000 });
    for (let i = 0; i < 2; i++) t.recordFailure(APPROVED, 0);
    expect(t.retryAfter(APPROVED, 0)).toBe(0);
  });

  it("locks out once the threshold is reached", () => {
    const t = createLoginThrottle({ threshold: 3, lockoutMs: 1000 });
    for (let i = 0; i < 3; i++) t.recordFailure(APPROVED, 0);
    expect(t.retryAfter(APPROVED, 0)).toBe(1000);
  });

  it("clears once the lockout has elapsed", () => {
    const t = createLoginThrottle({ threshold: 3, lockoutMs: 1000 });
    for (let i = 0; i < 3; i++) t.recordFailure(APPROVED, 0);
    expect(t.retryAfter(APPROVED, 1001)).toBe(0);
  });

  it("doubles the wait for each failure past the threshold", () => {
    const t = createLoginThrottle({ threshold: 2, lockoutMs: 100 });
    t.recordFailure(APPROVED, 0); t.recordFailure(APPROVED, 0);
    expect(t.retryAfter(APPROVED, 0)).toBe(100);
    t.recordFailure(APPROVED, 0);
    expect(t.retryAfter(APPROVED, 0)).toBe(200);
    t.recordFailure(APPROVED, 0);
    expect(t.retryAfter(APPROVED, 0)).toBe(400);
  });

  it("caps the wait so a genuine user is never locked out for long", () => {
    const t = createLoginThrottle({ threshold: 1, lockoutMs: 100 });
    for (let i = 0; i < 30; i++) t.recordFailure(APPROVED, 0);
    expect(t.retryAfter(APPROVED, 0)).toBe(800); // 8 x lockoutMs
  });

  it("forgets the failures once the user gets in", () => {
    const t = createLoginThrottle({ threshold: 2, lockoutMs: 1000 });
    t.recordFailure(APPROVED, 0); t.recordFailure(APPROVED, 0);
    expect(t.retryAfter(APPROVED, 0)).toBeGreaterThan(0);
    t.recordSuccess(APPROVED);
    expect(t.retryAfter(APPROVED, 0)).toBe(0);
  });

  it("throttles each address separately", () => {
    const t = createLoginThrottle({ threshold: 2, lockoutMs: 1000 });
    t.recordFailure(APPROVED, 0); t.recordFailure(APPROVED, 0);
    expect(t.retryAfter(APPROVED, 0)).toBeGreaterThan(0);
    expect(t.retryAfter(UNKNOWN, 0)).toBe(0);
  });

  it("treats a differently-cased address as the same account", () => {
    const t = createLoginThrottle({ threshold: 2, lockoutMs: 1000 });
    t.recordFailure(APPROVED, 0);
    t.recordFailure("NISAR.AHMED@ADBSAFEGATE.COM", 0);
    expect(t.retryAfter(APPROVED, 0)).toBeGreaterThan(0);
  });
});

describe("throttle wording", () => {
  it("counts in seconds under a minute", () => {
    expect(throttleMessage(30_000)).toMatch(/30 seconds/);
  });

  it("counts in minutes above one", () => {
    expect(throttleMessage(150_000)).toMatch(/3 minutes/);
  });
});
