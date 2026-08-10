import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The audit log is only worth having if it cannot be skipped, forged or
// rewritten — including by the person whose actions it records. Those
// properties live in the migration, not in the React layer, so these
// assertions pin them the same way onboardingMigration.test.js pins the
// profile lock: an edit that drops one fails the suite instead of shipping a
// log that quietly stopped being trustworthy.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(ROOT, "supabase_audit_log.sql"), "utf8");
const lower = sql.toLowerCase();

describe("the log records what it must", () => {
  it("creates the table", () => {
    expect(lower).toMatch(/create table if not exists public\.audit_log/);
  });

  it("records who, what, when and which record", () => {
    for (const col of [
      "occurred_at", "table_name", "record_id", "action",
      "changed_cols", "old_values", "new_values",
      "actor_emp_id", "actor_email", "actor_role", "actor_context",
    ]) {
      expect(lower).toContain(col);
    }
  });

  it("constrains the action to the three DML verbs", () => {
    expect(lower).toMatch(/check \(action in \('insert', 'update', 'delete'\)\)/);
  });

  it("groups one save's rows by transaction, so related changes stay together", () => {
    expect(lower).toMatch(/txid\s+bigint\s+not null default txid_current\(\)/);
  });
});

describe("the actor cannot be forged", () => {
  it("resolves the actor server-side from the session, never from the client", () => {
    expect(lower).toMatch(/public\.current_emp_id\(\)/);
    expect(lower).toMatch(/auth\.email\(\)/);
    expect(lower).toMatch(/public\.current_emp_role\(\)/);
  });

  it("distinguishes an end user, the backend, and a manual SQL-editor change", () => {
    expect(lower).toMatch(/when auth\.role\(\) is null then 'sql_editor'/);
  });
});

describe("the log cannot be written or rewritten from the API", () => {
  it("enables row level security", () => {
    expect(lower).toMatch(/alter table public\.audit_log enable row level security/);
  });

  it("revokes everything from PUBLIC, not just anon and authenticated", () => {
    // Postgres grants to PUBLIC by default; revoking only the two roles leaves
    // that grant in place — the exact mistake supabase_grant_hardening.sql was
    // written to correct.
    expect(lower).toMatch(/revoke all on public\.audit_log from public, anon, authenticated/);
  });

  it("grants SELECT and nothing else", () => {
    expect(lower).toMatch(/grant select on public\.audit_log to authenticated/);
    expect(lower).not.toMatch(/grant (insert|update|delete|all)[^;]*on public\.audit_log/);
  });

  it("gives managers the only read policy", () => {
    expect(lower).toMatch(/create policy audit_select_manager[\s\S]*?using \(public\.is_manager\(\)\)/);
  });

  it("has no INSERT, UPDATE or DELETE policy at all", () => {
    expect(lower).not.toMatch(/create policy[^;]*on public\.audit_log for (insert|update|delete)/);
  });

  it("locks down the sequence too, so it cannot be exhausted", () => {
    expect(lower).toMatch(/revoke all on sequence public\.audit_log_id_seq from public, anon, authenticated/);
  });
});

describe("the trigger is the only writer", () => {
  it("runs as SECURITY DEFINER with a pinned search_path", () => {
    expect(lower).toMatch(/create or replace function public\.record_audit\(\)[\s\S]*?security definer/);
    expect(lower).toMatch(/create or replace function public\.record_audit\(\)[\s\S]*?set search_path = public/);
  });

  it("is not reachable over the REST RPC surface", () => {
    expect(lower).toMatch(/revoke all on function public\.record_audit\(\) from public, anon, authenticated/);
  });

  it("fires AFTER, so a refused change leaves no misleading entry", () => {
    for (const t of ["employees", "leave_requests", "announcements"]) {
      expect(lower).toMatch(new RegExp(`after insert or update or delete on public\\.${t}`));
    }
  });

  it("covers overtime when that table exists", () => {
    expect(lower).toMatch(/to_regclass\('public\.overtime_requests'\) is not null/);
    expect(lower).toMatch(/trg_audit_overtime_requests/);
  });

  it("records nothing for an update that changed nothing", () => {
    // The app debounces and can re-send an unchanged row; a log full of no-op
    // saves buries the changes that matter.
    expect(lower).toMatch(/if tg_op = 'update' and cardinality\(changed\) = 0 then/);
  });
});

describe("identity documents are recorded as changed, never copied", () => {
  it("names the sensitive columns", () => {
    for (const col of [
      "passport_no", "eid_no", "mobile", "address", "dob",
      "emergency_contact", "emergency_name",
    ]) {
      expect(lower).toMatch(new RegExp(`'${col}'`));
    }
  });

  it("substitutes a marker rather than the value", () => {
    expect(lower).toContain("'[redacted]'");
  });

  it("still lists the column as changed, so the event is auditable", () => {
    expect(lower).toMatch(/changed := changed \|\| k;[\s\S]*?if k = any \(sensitive\) then/);
  });
});

describe("notifications are deliberately not audited", () => {
  it("installs no trigger on notifications", () => {
    expect(lower).not.toMatch(/on public\.notifications\s/);
  });

  it("says why, so it does not look like an oversight", () => {
    expect(lower).toMatch(/notifications are deliberately not audited/);
  });
});

describe("reading the log back", () => {
  it("provides an approvals view answering 'who approved this'", () => {
    expect(lower).toMatch(/create or replace view public\.audit_approvals/);
    expect(lower).toMatch(/from_status/);
    expect(lower).toMatch(/to_status/);
  });

  it("provides a privileged-changes view for role, grading and balances", () => {
    expect(lower).toMatch(/create or replace view public\.audit_privileged_changes/);
  });

  it("makes both views security_invoker, so audit_log's RLS still applies", () => {
    // Without this a view owned by postgres would hand every authenticated
    // user the whole log, defeating audit_select_manager entirely.
    const views = lower.match(/create or replace view public\.audit_\w+[\s\S]*?as\b/g) || [];
    expect(views).toHaveLength(2);
    for (const v of views) expect(v).toMatch(/security_invoker = true/);
  });
});

describe("retention is offered, not imposed", () => {
  it("provides a prune function", () => {
    expect(lower).toMatch(/create or replace function public\.prune_audit_log\(older_than interval\)/);
  });

  it("refuses to run as an end user, so a manager cannot trim their own trail", () => {
    expect(lower).toMatch(/prune_audit_log may only be run by the backend/);
  });

  it("is not reachable over RPC", () => {
    expect(lower).toMatch(/revoke all on function public\.prune_audit_log\(interval\) from public, anon, authenticated/);
  });

  it("schedules nothing by itself", () => {
    // Deleting audit history has a compliance dimension; a migration must not
    // quietly start doing it.
    expect(lower).not.toMatch(/^\s*select cron\.schedule/m);
  });
});

describe("the migration is safe to re-run", () => {
  it("guards every create against an existing object", () => {
    expect(lower).toMatch(/create table if not exists/);
    for (const m of lower.match(/create index [^;]+/g) || []) {
      expect(m).toContain("if not exists");
    }
    for (const m of lower.match(/^create trigger [^;]+/gm) || []) {
      expect(lower).toContain("drop trigger if exists " + m.split(/\s+/)[2]);
    }
  });

  it("replaces functions and policies rather than failing on them", () => {
    expect(lower).toMatch(/drop policy if exists audit_select_manager/);
    expect((lower.match(/create or replace function/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("the README lists the migration in order", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");

  it("names supabase_audit_log.sql", () => {
    expect(readme).toContain("supabase_audit_log.sql");
  });
});
