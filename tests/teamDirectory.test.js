import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  NOT_REGISTERED_MESSAGE, checkApprovedTeamLogin, approveTeamLogin,
} from "../src/teamDirectory.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Placeholders only. The real Team Mail IDs are personal addresses and this
// repository is public; they live in the database and nowhere else.
const APPROVED = "first.last@example.com";
const UNKNOWN  = "stranger@example.com";

describe("the refusal message", () => {
  it("gives the exact message the user should see", () => {
    expect(NOT_REGISTERED_MESSAGE).toBe(
      "This email address is not registered for the Team Portal. " +
      "Please contact your administrator."
    );
  });
});

describe("the authoritative check asks the database", () => {
  const rpcReturning = (value, calls = []) => ({
    rpc: async (fn, args) => { calls.push({ fn, args }); return { data: value, error: null }; },
  });

  it("calls is_approved_team_login with the trimmed address", async () => {
    const calls = [];
    await checkApprovedTeamLogin(rpcReturning(true, calls), "  " + APPROVED + " ");
    expect(calls).toEqual([
      { fn: "is_approved_team_login", args: { p_email: APPROVED } },
    ]);
  });

  it("reports the database as the source when it answers", async () => {
    expect(await checkApprovedTeamLogin(rpcReturning(true), APPROVED))
      .toEqual({ approved: true, source: "database" });
  });

  it("refuses when the database says no", async () => {
    expect(await checkApprovedTeamLogin(rpcReturning(false), UNKNOWN))
      .toEqual({ approved: false, source: "database" });
  });

  it("treats a non-true payload as a refusal", async () => {
    for (const v of [null, undefined, 0, "", "true"]) {
      const r = await checkApprovedTeamLogin(rpcReturning(v), APPROVED);
      expect(r.approved).toBe(false);
    }
  });

  it("answers null, not false, when the RPC errors", async () => {
    // A refusal here would lock the whole team out whenever the RPC hiccups.
    // Letting it through is safe: trg_guard_auth_user_approved still refuses
    // an unapproved account server-side.
    const broken = { rpc: async () => ({ data: null, error: { message: "not found" } }) };
    expect(await checkApprovedTeamLogin(broken, UNKNOWN))
      .toEqual({ approved: null, source: "unavailable" });
  });

  it("answers null when the RPC throws outright", async () => {
    const throwing = { rpc: async () => { throw new Error("offline"); } };
    expect(await checkApprovedTeamLogin(throwing, UNKNOWN))
      .toEqual({ approved: null, source: "unavailable" });
  });

  it("answers null without a client at all", async () => {
    expect(await checkApprovedTeamLogin(null, APPROVED))
      .toEqual({ approved: null, source: "unavailable" });
  });

  it("never grants an address unless the database says so", async () => {
    for (const client of [rpcReturning(false), null,
                          { rpc: async () => { throw new Error("x"); } }]) {
      const { approved } = await checkApprovedTeamLogin(client, UNKNOWN);
      expect(approved).not.toBe(true);
    }
  });

  it("answers true, false or null — never a bare falsy for 'don't know'", async () => {
    for (const client of [rpcReturning(true), rpcReturning(false), null]) {
      const { approved } = await checkApprovedTeamLogin(client, APPROVED);
      expect([true, false, null]).toContain(approved);
    }
  });
});

describe("the Team Mail ID list is not in this repository", () => {
  // The list is personal data, most of it private Gmail accounts, and this
  // repository is public. It lives in approved_team_logins; a new project is
  // seeded from the gitignored supabase_team_onboarding_data.local.sql.
  const PERSONAL = /[A-Za-z0-9._%+-]+@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud)\.[a-z.]+/gi;
  const read = f => readFileSync(join(ROOT, f), "utf8");

  it("src/teamDirectory.js holds no address and no local list", () => {
    const src = read("src/teamDirectory.js");
    expect(src.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[a-z]{2,}/g)).toBeNull();
    expect(src).not.toMatch(/TEAM_LOGINS_SOURCE|APPROVED_TEAM_LOGINS|__EMBED_TEAM_DIRECTORY__\s*\?/);
  });

  it("no migration carries a personal address", () => {
    for (const f of readdirSync(ROOT).filter(f => /^supabase_.*\.sql$/.test(f))) {
      expect(read(f).match(PERSONAL), f).toBeNull();
    }
  });

  it("the onboarding migration seeds and maps no address at all", () => {
    const sql = read("supabase_team_onboarding.sql");
    expect(sql.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[a-z]{2,}/g)).toBeNull();
  });

  it("keeps the local seed file out of git", () => {
    expect(read(".gitignore")).toMatch(/^\*\.local\.sql$/m);
  });

  it("ships a template that uses placeholders only", () => {
    const sql = read("supabase_team_onboarding_data.example.sql");
    expect(sql).toMatch(/insert into public\.approved_team_logins/i);
    const addrs = sql.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) || [];
    expect(addrs.length).toBeGreaterThan(0);
    for (const a of addrs) expect(a).toMatch(/@example\.com$/);
  });

  it("no longer defines __EMBED_TEAM_DIRECTORY__ in build.js", () => {
    expect(read("build.js")).not.toMatch(/__EMBED_TEAM_DIRECTORY__/);
  });

  it("keeps a build-time check that refuses a bundle with any address in it", () => {
    const verify = read("scripts/verify-dist.js");
    expect(verify).toMatch(/EMAIL_RE/);
    expect(verify).toMatch(/process\.exit\(1\)/);
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
    await approveTeamLogin(rpc("approved", calls), "  New.Joiner@Example.com ", "Aug intake");
    expect(calls).toEqual([
      { fn: "approve_team_login", args: { p_email: "new.joiner@example.com", p_label: "Aug intake" } },
    ]);
  });

  it("reports success in words the manager can act on", async () => {
    const r = await approveTeamLogin(rpc("approved"), "new.joiner2@example.com");
    expect(r.ok).toBe(true);
    expect(r.alreadyApproved).toBe(false);
    expect(r.message).toMatch(/can now be invited/);
  });

  it("treats an already-approved address as success, not an error", async () => {
    // Re-approving is harmless and the manager's intent is satisfied either
    // way; surfacing it as a failure would just make them wonder.
    const r = await approveTeamLogin(rpc("already approved"), "new.joiner3@example.com");
    expect(r.ok).toBe(true);
    expect(r.alreadyApproved).toBe(true);
  });

  it("explains a permission refusal in plain words", async () => {
    const denied = {
      rpc: async () => ({ data: null, error: { message: "insufficient_privilege: Only a manager may approve a Team Mail ID" } }),
    };
    const r = await approveTeamLogin(denied, "new.joiner4@example.com");
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
    expect((await approveTeamLogin(null, "new.joiner1@example.com")).ok).toBe(false);
    const throwing = { rpc: async () => { throw new Error("offline"); } };
    expect((await approveTeamLogin(throwing, "new.joiner1@example.com")).ok).toBe(false);
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
