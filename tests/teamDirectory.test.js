import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  APPROVED_TEAM_LOGINS, UNRESOLVED_TEAM_LOGINS, HAS_EMBEDDED_DIRECTORY,
  isApprovedTeamLogin, isUnresolvedTeamLogin, NOT_REGISTERED_MESSAGE,
  checkApprovedTeamLogin, approveTeamLogin,
} from "../src/teamDirectory.js";
import { isEmailTaken } from "../src/onboarding.js";

// The 31 Team Mail IDs, verbatim.
const TEAM = [
  "muhammed.farhan.ext@adbsafegate.com",
  "anurag.aikkal@adbsafegate.com",
  "amarnath.munderi@adbsafegate.com",
  "gopakumar.gopinadhan@adbsafegate.com",
  "nisar.ahmed@adbsafegate.com",
  "jjijosebastian311@gmail.com",
  "nithin.kumar@adbsafegate.com",
  "praveen6273@gmail.com",
  "jesudaskt22@gmail.com",
  "prajeshprabhakar002@gmail.com",
  "Bv4haris@gmail.com",
  "ragesh.menon@adbsafegate.com",
  "sanoop.louis@adbsafegate.com",
  "mohammed.faheem@adbsafegate.com",
  "tahseenkhan2332@gmail.com",
  "vikrampal642@gmail.com",
  "midhunbabu1902@gmail.com",
  "vineethpatteri@gmail.com",
  "dhivakarangunasekaran@gmail.com",
  "yadunath.kaitheri@adbsafegate.com",
  "srigajeg84@gmail.com",
  "rajumottammal276@gmail.com",
  "ganesh2842014@gmail.com",
  "thomas2937@gmail.com",
  "abubaker.ab151@gmail.com",
  "Mepeese@gmail.com",
  "muhammed.talhalateef@adbsafegate.com",
  "sandeepselvan1999@gmail.com",
  "abhishekabhi0280@gmail.com",
  "syedmuzaffar7869@gmail.com",
  "danish.khan7556@gmail.com",
];

// The AS-SUPPLIED forms of the last four, which were corrected before being
// approved. Two contained a space, one was on "gmsil.com", one misspelt a
// roster name. These broken spellings must never reappear: a space makes an
// address invalid outright, and approving a mistyped one would let whoever
// really owns it create an account.
const WITHHELD = [
  "abhishe kabhi0280@gmail.com",
  "sandeepse lvan1999@gmail.com",
  "syedmuzaffar7869@gmsil.com",
  "danisn.khan7556@gmail.com",
];

describe("the approved list is exactly the thirty-one Team Mail IDs", () => {
  it("holds all thirty-one, verbatim", () => {
    expect([...APPROVED_TEAM_LOGINS].sort()).toEqual([...TEAM].sort());
  });

  it("holds the corrected form of each address, never the broken one", () => {
    const approved = APPROVED_TEAM_LOGINS.map(e => e.toLowerCase());
    for (const [broken, corrected] of [
      ["abhishe kabhi0280@gmail.com",  "abhishekabhi0280@gmail.com"],
      ["sandeepse lvan1999@gmail.com", "sandeepselvan1999@gmail.com"],
      ["syedmuzaffar7869@gmsil.com",   "syedmuzaffar7869@gmail.com"],
      ["danisn.khan7556@gmail.com",    "danish.khan7556@gmail.com"],
    ]) {
      expect(approved).toContain(corrected);
      expect(approved).not.toContain(broken);
    }
  });

  it("holds none of the four withheld addresses", () => {
    const approved = APPROVED_TEAM_LOGINS.map(e => e.toLowerCase());
    for (const e of WITHHELD) {
      expect(approved).not.toContain(e.toLowerCase());
      expect(isApprovedTeamLogin(e)).toBe(false);
    }
  });

  it("contains no address with whitespace in it", () => {
    for (const e of APPROVED_TEAM_LOGINS) expect(e).not.toMatch(/\s/);
  });

  it("contains no address on a misspelt Gmail domain", () => {
    for (const e of APPROVED_TEAM_LOGINS) {
      expect(e.toLowerCase()).not.toMatch(/@gmsil\.|@gmial\.|@gmai\./);
    }
  });

  it("preserves the original casing", () => {
    expect(APPROVED_TEAM_LOGINS).toContain("Bv4haris@gmail.com");
  });

  it("contains no duplicates", () => {
    const lower = APPROVED_TEAM_LOGINS.map(e => e.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it("does not include Dhanesh", () => {
    expect(APPROVED_TEAM_LOGINS.join(" ").toLowerCase()).not.toContain("dhanesh");
  });
});

describe("an unknown email cannot create an account", () => {
  const unknown = [
    "attacker@example.com",
    "someone@adbsafegate.com",          // right domain, not on the list
    "amarnath.munderi@adbsafegate.ae",  // old derived address, superseded
    "dhanesh@adbsafegate.com",          // explicitly out of scope
    "",
    "   ",
  ];

  it.each(unknown)("rejects %j", email => {
    expect(isApprovedTeamLogin(email)).toBe(false);
  });

  it("rejects non-string input rather than throwing", () => {
    for (const v of [null, undefined, 0, {}, []]) {
      expect(isApprovedTeamLogin(v)).toBe(false);
    }
  });

  it("gives the exact message the user should see", () => {
    expect(NOT_REGISTERED_MESSAGE).toBe(
      "This email address is not registered for the Team Portal. " +
      "Please contact your administrator."
    );
  });

  it("a near-miss on an approved address is still rejected", () => {
    expect(isApprovedTeamLogin("anurag.aikkal@adbsafegate.co")).toBe(false);
    expect(isApprovedTeamLogin("anurag.aikkall@adbsafegate.com")).toBe(false);
    expect(isApprovedTeamLogin("nurag.aikkal@adbsafegate.com")).toBe(false);
  });
});

describe("an unknown email cannot create an employee record", () => {
  // Mirrors the guard in addInviteEmployee / addInviteEmployeesBulk: an address
  // that cannot pass the login gate must not produce a roster row, or the
  // result is an employee who is permanently locked out.
  const wouldCreateRecord = (roster, email) =>
    !isEmailTaken(roster, email) && isApprovedTeamLogin(email);

  it("refuses a roster row for an unapproved address", () => {
    expect(wouldCreateRecord([], "attacker@example.com")).toBe(false);
  });

  it("refuses a roster row for a plausible but unlisted colleague", () => {
    expect(wouldCreateRecord([], "new.joiner@adbsafegate.com")).toBe(false);
  });

  it("allows a roster row for an approved address", () => {
    expect(wouldCreateRecord([], "nisar.ahmed@adbsafegate.com")).toBe(true);
  });

  it("still refuses an approved address that is already taken", () => {
    const roster = [{ id: "EMP-019", email: "nisar.ahmed@adbsafegate.com" }];
    expect(wouldCreateRecord(roster, "nisar.ahmed@adbsafegate.com")).toBe(false);
  });
});

describe("approved Team Mail IDs proceed to onboarding", () => {
  it.each(TEAM)("admits %s", email => {
    expect(isApprovedTeamLogin(email)).toBe(true);
  });

  it("matches case-insensitively so typing is forgiving", () => {
    expect(isApprovedTeamLogin("BV4HARIS@GMAIL.COM")).toBe(true);
    expect(isApprovedTeamLogin("Amarnath.Munderi@AdbSafegate.com")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isApprovedTeamLogin("  sanoop.louis@adbsafegate.com  ")).toBe(true);
  });

  it("admits a member who has no auth account yet", () => {
    // The gate is independent of auth.users — an approved address reaches the
    // sign-up branch and establishes its own password there.
    expect(isApprovedTeamLogin("jesudaskt22@gmail.com")).toBe(true);
  });

  it("admits an existing auth user the same way", () => {
    // mohammed.faheem@adbsafegate.com already has an auth account; the gate
    // does not treat it differently, so normal sign-in is unaffected.
    expect(isApprovedTeamLogin("mohammed.faheem@adbsafegate.com")).toBe(true);
  });
});

describe("the unresolved mappings are approved but flagged", () => {
  it("names exactly the nine addresses with no employee row", () => {
    expect([...UNRESOLVED_TEAM_LOGINS].sort()).toEqual([
      "Mepeese@gmail.com",
      "abubaker.ab151@gmail.com",
      "ganesh2842014@gmail.com",
      "jjijosebastian311@gmail.com",
      "muhammed.talhalateef@adbsafegate.com",
      "praveen6273@gmail.com",
      "rajumottammal276@gmail.com",
      "srigajeg84@gmail.com",
      "thomas2937@gmail.com",
    ].sort());
  });

  it("still lets them sign in — they are approved team members", () => {
    for (const e of UNRESOLVED_TEAM_LOGINS) {
      expect(isApprovedTeamLogin(e)).toBe(true);
      expect(isUnresolvedTeamLogin(e)).toBe(true);
    }
  });

  it("does not flag a resolved address as unresolved", () => {
    expect(isUnresolvedTeamLogin("nisar.ahmed@adbsafegate.com")).toBe(false);
  });

  it("every unresolved address is also on the approved list", () => {
    const approved = APPROVED_TEAM_LOGINS.map(e => e.toLowerCase());
    for (const e of UNRESOLVED_TEAM_LOGINS) {
      expect(approved).toContain(e.toLowerCase());
    }
  });
});

describe("the authoritative check asks the database", () => {
  const rpcReturning = (value, calls = []) => ({
    rpc: async (fn, args) => { calls.push({ fn, args }); return { data: value, error: null }; },
  });

  it("calls is_approved_team_login with the trimmed address", async () => {
    const calls = [];
    await checkApprovedTeamLogin(rpcReturning(true, calls), "  nisar.ahmed@adbsafegate.com ");
    expect(calls).toEqual([
      { fn: "is_approved_team_login", args: { p_email: "nisar.ahmed@adbsafegate.com" } },
    ]);
  });

  it("reports the database as the source when it answers", async () => {
    const r = await checkApprovedTeamLogin(rpcReturning(true), "nisar.ahmed@adbsafegate.com");
    expect(r).toEqual({ approved: true, source: "database" });
  });

  it("refuses when the database says no, even for a locally-listed address", async () => {
    // The database is authoritative: if the row has been revoked there, the
    // stale client list must not grant access.
    const r = await checkApprovedTeamLogin(rpcReturning(false), "nisar.ahmed@adbsafegate.com");
    expect(r.approved).toBe(false);
    expect(r.source).toBe("database");
  });

  it("treats a non-true payload as a refusal", async () => {
    for (const v of [null, undefined, 0, "", "true"]) {
      const r = await checkApprovedTeamLogin(rpcReturning(v), "nisar.ahmed@adbsafegate.com");
      expect(r.approved).toBe(false);
    }
  });

  it("falls back to the local list when the RPC errors", async () => {
    const broken = { rpc: async () => ({ data: null, error: { message: "not found" } }) };
    const ok = await checkApprovedTeamLogin(broken, "nisar.ahmed@adbsafegate.com");
    expect(ok).toEqual({ approved: true, source: "local-fallback" });
    const bad = await checkApprovedTeamLogin(broken, "attacker@example.com");
    expect(bad).toEqual({ approved: false, source: "local-fallback" });
  });

  it("falls back when the RPC throws outright", async () => {
    const throwing = { rpc: async () => { throw new Error("offline"); } };
    const r = await checkApprovedTeamLogin(throwing, "attacker@example.com");
    expect(r.approved).toBe(false);
  });

  it("never grants an unknown address through any path", async () => {
    const cases = [rpcReturning(true), rpcReturning(false), null,
                   { rpc: async () => { throw new Error("x"); } }];
    for (const client of cases) {
      const r = await checkApprovedTeamLogin(client, "attacker@example.com");
      // rpcReturning(true) is a hostile server; the database is authoritative
      // by design, so that one case is expected to pass — every offline or
      // failing path must still refuse.
      if (client === cases[0]) continue;
      expect(r.approved).toBe(false);
    }
  });

  it("works without a client at all", async () => {
    expect(await checkApprovedTeamLogin(null, "nisar.ahmed@adbsafegate.com"))
      .toEqual({ approved: true, source: "local" });
  });

  it("answers true, false or null — never a bare falsy for 'don't know'", async () => {
    // Callers must branch on `=== false`. A production bundle carries no local
    // directory, so an unreachable RPC yields null; treating that as a refusal
    // would lock out the whole team whenever the RPC hiccups, and treating it
    // as approval is safe because trg_guard_auth_user_approved still refuses
    // the account server-side.
    for (const client of [rpcReturning(true), rpcReturning(false), null]) {
      const { approved } = await checkApprovedTeamLogin(client, "nisar.ahmed@adbsafegate.com");
      expect([true, false, null]).toContain(approved);
    }
  });
});

describe("the directory is never shipped to production", () => {
  // The list is personal data — most of it private Gmail accounts — and a
  // bundle is public. build.js compiles it out unless SHOW_DEMO_LOGIN is set,
  // and scripts/verify-dist.js fails the build if an address survives. These
  // assertions pin the mechanism the same way securityHeaders.test.js pins the
  // response headers: the check is worthless if it can be quietly removed.
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

  it("gates both arrays on the __EMBED_TEAM_DIRECTORY__ define", () => {
    const src = readFileSync(join(ROOT, "src/teamDirectory.js"), "utf8");
    expect(src).toMatch(/__EMBED_TEAM_DIRECTORY__/);
    expect(src).toMatch(/APPROVED_TEAM_LOGINS\s*=\s*EMBED\s*\?/);
    expect(src).toMatch(/UNRESOLVED_TEAM_LOGINS\s*=\s*EMBED\s*\?/);
  });

  it("ties the define to demo mode in build.js, so production never sets it", () => {
    const build = readFileSync(join(ROOT, "build.js"), "utf8");
    expect(build).toMatch(/const\s+embedTeamDirectory\s*=\s*showDemoLogin/);
    expect(build).toMatch(/__EMBED_TEAM_DIRECTORY__:\s*JSON\.stringify\(!!embedTeamDirectory\)/);
  });

  it("keeps a build-time check that refuses a bundle with any address in it", () => {
    const verify = readFileSync(join(ROOT, "scripts/verify-dist.js"), "utf8");
    expect(verify).toMatch(/EMAIL_RE/);
    expect(verify).toMatch(/process\.exit\(1\)/);
  });

  it("reports whether this build carries the directory", () => {
    // True under vitest (no define), false in a production bundle.
    expect(HAS_EMBEDDED_DIRECTORY).toBe(true);
  });
});

describe("a manager can approve a new joiner without a developer", () => {
  // Verifying the deployment surfaced an operational dead end: a manager
  // could not onboard a new hire at all. trg_guard_employee_email_approved
  // refuses a roster row for an unapproved address, and nothing outside the
  // SQL editor could add one — so every new joiner needed a developer, or
  // somebody was handed the service-role key. Both are worse than an audited
  // action by the manager who already sets roles and pay bands.
  const rpc = (result, calls = []) => ({
    rpc: async (fn, args) => { calls.push({ fn, args }); return { data: result, error: null }; },
  });

  it("calls approve_team_login with a normalised address", async () => {
    const calls = [];
    await approveTeamLogin(rpc("approved", calls), "  New.Joiner@AdbSafegate.com ", "Aug intake");
    expect(calls).toEqual([
      { fn: "approve_team_login", args: { p_email: "new.joiner@adbsafegate.com", p_label: "Aug intake" } },
    ]);
  });

  it("reports success in words the manager can act on", async () => {
    const r = await approveTeamLogin(rpc("approved"), "new.joiner@adbsafegate.com");
    expect(r.ok).toBe(true);
    expect(r.alreadyApproved).toBe(false);
    expect(r.message).toMatch(/can now be invited/);
  });

  it("treats an already-approved address as success, not an error", async () => {
    // Re-approving is harmless and the manager's intent is satisfied either
    // way; surfacing it as a failure would just make them wonder.
    const r = await approveTeamLogin(rpc("already approved"), "nisar.ahmed@adbsafegate.com");
    expect(r.ok).toBe(true);
    expect(r.alreadyApproved).toBe(true);
  });

  it("explains a permission refusal in plain words", async () => {
    const denied = {
      rpc: async () => ({ data: null, error: { message: "insufficient_privilege: Only a manager may approve a Team Mail ID" } }),
    };
    const r = await approveTeamLogin(denied, "x@y.com");
    expect(r.ok).toBe(false);
    expect(r.message).toBe("Only a manager can approve a Team Mail ID");
  });

  it("refuses obviously invalid input before the round trip", async () => {
    const calls = [];
    const client = rpc("approved", calls);
    for (const bad of ["", "   ", "not-an-email", null, undefined]) {
      const r = await approveTeamLogin(client, bad);
      expect(r.ok).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it("does not throw when the backend is missing or broken", async () => {
    expect((await approveTeamLogin(null, "a@b.com")).ok).toBe(false);
    const throwing = { rpc: async () => { throw new Error("offline"); } };
    expect((await approveTeamLogin(throwing, "a@b.com")).ok).toBe(false);
  });
});

describe("the self-service migration keeps the list unenumerable", () => {
  const ROOT2 = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sql = readFileSync(join(ROOT2, "supabase_onboarding_selfservice.sql"), "utf8").toLowerCase();

  it("checks is_manager() inside every function rather than trusting the caller", () => {
    for (const fn of ["approve_team_login", "revoke_team_login"]) {
      const body = sql.slice(sql.indexOf(`function public.${fn}`));
      expect(body).toMatch(/if not public\.is_manager\(\) then/);
    }
    expect(sql).toMatch(/where public\.is_manager\(\)/); // list_team_logins
  });

  it("still grants no SELECT on the table, so the list cannot be enumerated", () => {
    // supabase_team_onboarding.sql deliberately withheld this; a convenience
    // grant here would undo it.
    expect(sql).not.toMatch(/grant select on (table )?public\.approved_team_logins/);
  });

  it("validates the address, because a typo hands the account to a stranger", () => {
    expect(sql).toMatch(/is not a valid email address/);
    expect(sql).toMatch(/\[:space:\]/);
  });

  it("refuses to revoke an address that still has an employee", () => {
    expect(sql).toMatch(/offboard them instead/);
  });

  it("records who approved each address", () => {
    expect(sql).toMatch(/add column if not exists approved_by_id/);
    expect(sql).toMatch(/add column if not exists approved_by_email/);
  });
});
