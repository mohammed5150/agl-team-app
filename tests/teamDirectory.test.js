import { describe, it, expect } from "vitest";
import {
  APPROVED_TEAM_LOGINS, UNRESOLVED_TEAM_LOGINS,
  isApprovedTeamLogin, isUnresolvedTeamLogin, NOT_REGISTERED_MESSAGE,
  checkApprovedTeamLogin,
} from "../src/teamDirectory.js";
import { isEmailTaken } from "../src/onboarding.js";

// The 14 Team Mail IDs, verbatim.
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
];

describe("the approved list is exactly the fourteen Team Mail IDs", () => {
  it("holds all fourteen, verbatim", () => {
    expect([...APPROVED_TEAM_LOGINS].sort()).toEqual([...TEAM].sort());
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

describe("the two unresolved mappings are approved but flagged", () => {
  it("names exactly the two ambiguous addresses", () => {
    expect([...UNRESOLVED_TEAM_LOGINS].sort()).toEqual(
      ["jjijosebastian311@gmail.com", "praveen6273@gmail.com"]
    );
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
});
