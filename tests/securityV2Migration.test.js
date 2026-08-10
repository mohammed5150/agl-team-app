import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The database is the security boundary, so these guarantees are pinned the
// same way the onboarding and audit migrations are: a later edit that drops
// one fails the suite instead of quietly reopening the hole.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(ROOT, "supabase_security_v2.sql"), "utf8");
const lower = sql.toLowerCase();

describe("an employee cannot notify a colleague", () => {
  // The portal renders notifications as browser and push alerts, so a
  // colleague-addressed notification is an in-app phishing channel carrying
  // the portal's own credibility: "Your leave was rejected — call this
  // number" arrives looking exactly like a genuine one, because it is one.
  it("routes the INSERT policy through can_notify", () => {
    expect(lower).toMatch(/create or replace function public\.can_notify\(target_emp_id text\)/);
    expect(lower).toMatch(
      /create policy nf_insert_employee[\s\S]*?with check \(public\.can_notify\(to_user\)\)/
    );
  });

  it("replaces the old unscoped policies rather than sitting alongside them", () => {
    expect(lower).toMatch(/drop policy if exists nf_insert_authenticated on public\.notifications/);
    expect(lower).toMatch(/drop policy if exists nf_insert_employee on public\.notifications/);
  });

  it("still lets an employee notify an approver, which the app needs", () => {
    // submitLeave and submitOvertime address team leads and managers.
    expect(lower).toMatch(/e\.role in \('teamlead', 'manager'\)/);
  });

  it("still lets staff notify anyone", () => {
    expect(lower).toMatch(/public\.is_staff\(\)/);
  });

  it("still requires the sender to be a real employee", () => {
    expect(lower).toMatch(/public\.current_emp_id\(\) is not null/);
  });

  it("freezes a notification's content once sent", () => {
    // Recipients need UPDATE to mark one read; that must not extend to
    // rewriting what it says.
    expect(lower).toMatch(/create or replace function public\.guard_notification_immutable\(\)/);
    expect(lower).toMatch(/new\.message is distinct from old\.message/);
    expect(lower).toMatch(/create trigger trg_guard_notification_immutable/);
    expect(lower).toMatch(/before update on public\.notifications/);
  });
});

describe("offboarding deactivates instead of deleting", () => {
  it("adds employment_status with a constrained set of values", () => {
    expect(lower).toMatch(/add column if not exists employment_status text not null default 'active'/);
    expect(lower).toMatch(/check \(employment_status in \('active', 'suspended', 'offboarded'\)\)/);
  });

  it("removes the employee DELETE policy entirely", () => {
    // Deleting the row took leave history, ratings and audit resolution with
    // it — data loss dressed up as a feature.
    expect(lower).toMatch(/drop policy if exists emp_delete_manager on public\.employees/);
    expect(lower).not.toMatch(/create policy emp_delete/);
  });

  it("says why there is no DELETE policy, so it does not look accidental", () => {
    expect(lower).toMatch(/no delete policy by design/);
  });

  it("lets only a manager change the status", () => {
    expect(lower).toMatch(/only a manager may change employment status/);
    expect(lower).toMatch(/create trigger trg_guard_employment_status/);
  });

  it("derives offboarded_at in the database, never from the client", () => {
    expect(lower).toMatch(/new\.offboarded_at := now\(\)/);
    expect(lower).toMatch(/new\.offboarded_at := old\.offboarded_at/);
  });

  it("stops a manager offboarding themselves out of the account that can undo it", () => {
    expect(lower).toMatch(/you cannot change your own employment status/);
  });
});

describe("the status change and its reason are one transaction", () => {
  // set_config(..., true) is transaction-local and PostgREST runs each request
  // in its own transaction, so a client doing "set the reason" then "do the
  // update" would lose the reason before the audit trigger could read it — and
  // a status change with no reason is a change log, not an audit trail.
  it("provides a single RPC that does both", () => {
    expect(lower).toMatch(
      /create or replace function public\.set_employment_status\(\s*p_emp_id text,\s*p_status text,\s*p_reason text default null\s*\)/
    );
    expect(lower).toMatch(/perform set_config\('app\.audit_reason'/);
    expect(lower).toMatch(/update public\.employees\s*set employment_status = p_status/);
  });

  it("checks the caller's role itself rather than trusting them", () => {
    expect(lower).toMatch(/if not public\.is_manager\(\) then/);
  });

  it("validates the status rather than writing whatever it is given", () => {
    expect(lower).toMatch(/p_status not in \('active', 'suspended', 'offboarded'\)/);
  });

  it("reports a missing employee instead of silently doing nothing", () => {
    expect(lower).toMatch(/if not found then/);
  });

  it("is callable by end users, because it is the supported path", () => {
    expect(lower).toMatch(
      /grant execute on function public\.set_employment_status\(text, text, text\) to authenticated/
    );
  });
});

describe("a deactivated account cannot act", () => {
  it("checks activity in the INSERT policies, not only in the app", () => {
    // A stale session or a direct API call must be refused too.
    expect(lower).toMatch(/create or replace function public\.is_active_employee\(\)/);
    expect(lower).toMatch(/employment_status = 'active'/);
    expect(lower).toMatch(
      /create policy lr_insert_self[\s\S]*?and public\.is_active_employee\(\)/
    );
    expect(lower).toMatch(/ot_insert_self[\s\S]*?is_active_employee\(\)/);
  });

  it("leaves existing rows readable, so history and the audit trail still resolve", () => {
    expect(lower).not.toMatch(/drop policy if exists lr_select/);
    expect(lower).not.toMatch(/drop policy if exists emp_select_all/);
  });
});

describe("function grants follow the PUBLIC rule", () => {
  // Postgres grants EXECUTE to PUBLIC by default; revoking only anon and
  // authenticated leaves that grant in place — the mistake corrected in
  // supabase_grant_hardening.sql.
  it("revokes trigger functions from PUBLIC by name", () => {
    for (const fn of ["guard_notification_immutable", "guard_employment_status"]) {
      expect(lower).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon, authenticated`)
      );
    }
  });

  it("revokes from PUBLIC before granting the two functions RLS needs", () => {
    for (const sig of [
      "can_notify\\(text\\)",
      "is_active_employee\\(\\)",
      "set_employment_status\\(text, text, text\\)",
    ]) {
      expect(lower).toMatch(new RegExp(`revoke all on function public\\.${sig} from public, anon`));
      expect(lower).toMatch(new RegExp(`grant execute on function public\\.${sig} to authenticated`));
    }
  });

  it("pins search_path on every SECURITY DEFINER function", () => {
    const definers = lower.match(/security definer[\s\S]{0,120}?as \$\$/g) || [];
    expect(definers.length).toBeGreaterThanOrEqual(4);
    for (const d of definers) expect(d).toMatch(/set search_path = public/);
  });
});

describe("the migration is safe to re-run", () => {
  it("guards every column add and index", () => {
    for (const m of lower.match(/add column [^;]+/g) || []) {
      expect(m).toContain("if not exists");
    }
    for (const m of lower.match(/create index [^;]+/g) || []) {
      expect(m).toContain("if not exists");
    }
  });

  it("drops each trigger before creating it", () => {
    for (const name of ["trg_guard_notification_immutable", "trg_guard_employment_status"]) {
      expect(lower).toMatch(new RegExp(`drop trigger if exists ${name}`));
    }
  });

  it("tolerates a deployment with no overtime table", () => {
    expect(lower).toMatch(/to_regclass\('public\.overtime_requests'\) is null/);
  });
});

describe("the operations docs exist and are referenced", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");

  it.each(["docs/SECURITY.md", "docs/BACKUP_RESTORE.md", "docs/MONITORING.md"])(
    "the README points at %s", path => {
      expect(readme).toContain(path);
      expect(() => readFileSync(join(ROOT, path), "utf8")).not.toThrow();
    });

  it("lists supabase_security_v2.sql in the migration order", () => {
    expect(readme).toContain("supabase_security_v2.sql");
  });

  it("tells the operator to raise the Supabase password minimum to 12", () => {
    // The client-side policy is decorative without it — Supabase's own
    // default is 6.
    expect(readme).toMatch(/[Mm]inimum password length.*12/);
  });

  it("tells the operator to configure the reset redirect URL", () => {
    // Password reset links silently do not work without it.
    expect(readme).toMatch(/Redirect URLs/);
  });
});
