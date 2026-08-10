import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  LEAVE_STATUSES, OVERTIME_STATUSES,
  MAX_LEAVE_DAYS, MIN_OT_HOURS, MAX_OT_HOURS, MAX_OT_HOURS_PER_DAY,
} from "../src/validation.js";

// src/validation.js and supabase_validation.sql state the same rules — one so
// the form can answer before the round trip, one because it is the actual
// boundary. These assertions keep them from drifting apart, which is the
// failure mode that produces a form saying "fine" and a database saying "no".

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(ROOT, "supabase_validation.sql"), "utf8");
const lower = sql.toLowerCase();

describe("statuses agree between the app and the database", () => {
  it("constrains leave to exactly the statuses the workflow knows", () => {
    const m = lower.match(/check \(status in \(([^)]*)\)\)[\s\S]{0,80}?not valid/);
    expect(m).not.toBeNull();
    for (const s of LEAVE_STATUSES) expect(lower).toContain(`'${s}'`);
  });

  it("gives overtime no tl_approved stage, because the team lead is final", () => {
    const otBlock = lower.slice(lower.indexOf("overtime_requests_status_check"));
    const check = otBlock.match(/check \(status in \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    for (const s of OVERTIME_STATUSES) expect(check[1]).toContain(`'${s}'`);
    expect(check[1]).not.toContain("tl_approved");
  });
});

describe("bounds agree between the app and the database", () => {
  it("caps a leave request at the same number of days", () => {
    expect(lower).toMatch(new RegExp(`days > 0 and days <= ${MAX_LEAVE_DAYS}`));
  });

  it("bounds overtime hours the same way, in half-hour steps", () => {
    expect(lower).toMatch(new RegExp(`hours >= ${MIN_OT_HOURS} and hours <= ${MAX_OT_HOURS}`));
    expect(lower).toMatch(/\(hours \* 2\) = floor\(hours \* 2\)/);
  });

  it("uses the same daily overtime ceiling", () => {
    expect(lower).toMatch(new RegExp(`existing \\+ new\\.hours > ${MAX_OT_HOURS_PER_DAY}`));
  });

  it("requires the end date not to precede the start", () => {
    expect(lower).toMatch(/end_date >= start_date/);
  });
});

describe("overlap is enforced where it can be — in the database", () => {
  it("guards overlapping leave with a trigger, not a client check", () => {
    // Overlap depends on other rows, so two concurrent submissions could each
    // pass their own client-side check and still conflict.
    expect(lower).toMatch(/create or replace function public\.guard_leave_overlap\(\)/);
    expect(lower).toMatch(/create trigger trg_guard_leave_overlap/);
    expect(lower).toMatch(/before insert or update of emp_id, start_date, end_date, status/);
  });

  it("compares ranges inclusively, so touching days count as a clash", () => {
    expect(lower).toMatch(/daterange\(start_date, end_date, '\[\]'\) && daterange\(new\.start_date, new\.end_date, '\[\]'\)/);
  });

  it("only counts requests that occupy the calendar", () => {
    // A rejected or withdrawn request must be free to overlap anything.
    expect(lower).toMatch(/status in \('pending', 'tl_approved', 'approved'\)/);
  });

  it("guards the overtime daily total the same way", () => {
    expect(lower).toMatch(/create or replace function public\.guard_overtime_daily_total\(\)/);
    expect(lower).toMatch(/trg_guard_overtime_daily_total/);
  });

  it("keeps both guard functions off the RPC surface", () => {
    for (const fn of ["guard_leave_overlap", "guard_overtime_daily_total"]) {
      expect(lower).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon, authenticated`)
      );
    }
  });

  it("indexes what the guards look up, so an insert does not scan the table", () => {
    expect(lower).toMatch(/create index if not exists leave_requests_emp_dates_idx/);
    expect(lower).toMatch(/create index if not exists overtime_requests_emp_date_idx/);
  });
});

describe("the manager's leave transitions are pinned", () => {
  // supabase_rls_hardening.sql pinned the employee and team lead but left the
  // manager policy as an unconstrained `with check (is_manager())`, so a
  // manager could write any status — including moving a finished request back
  // to pending, which resets the approval chain and leaves the audit trail
  // describing a sequence that never happened.
  it("replaces lr_update_mgr with a status-scoped policy", () => {
    expect(lower).toMatch(/drop policy if exists lr_update_mgr on public\.leave_requests/);
    expect(lower).toMatch(
      /create policy lr_update_mgr[\s\S]*?with check \(public\.is_manager\(\) and status in \('approved', 'rejected'\)\)/
    );
  });

  it("lets a manager act only on a request the team lead has passed up", () => {
    expect(lower).toMatch(
      /using \(public\.is_manager\(\) and status in \('tl_approved', 'approved', 'rejected'\)\)/
    );
  });
});

describe("leave balances are deliberately not constrained", () => {
  it("says why, so it does not read as an omission", () => {
    // Management may legitimately approve leave beyond a balance as unpaid;
    // a constraint would push that conversation off the system.
    expect(lower).toMatch(/balance/);
    expect(lower).toMatch(/unpaid/);
  });

  it("adds no check constraint against the balance columns", () => {
    expect(lower).not.toMatch(/check \([^)]*used_annual[^)]*\)/);
  });
});

describe("the migration is safe to apply and re-apply", () => {
  it("adds constraints NOT VALID first, so one stale row cannot fail the run", () => {
    const adds = lower.match(/add constraint \w+[\s\S]*?not valid/g) || [];
    expect(adds.length).toBeGreaterThanOrEqual(5);
  });

  it("validates each constraint it adds", () => {
    for (const name of [
      "leave_requests_status_check", "leave_requests_dates_check",
      "leave_requests_days_check", "overtime_requests_status_check",
      "overtime_requests_hours_check", "announcements_priority_check",
    ]) {
      expect(lower).toMatch(new RegExp(`validate constraint ${name}`));
    }
  });

  it("guards every add against the constraint already existing", () => {
    const guards = lower.match(/select 1 from pg_constraint where conname = '\w+'/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(6);
  });

  it("tolerates a deployment with no overtime table", () => {
    expect((lower.match(/to_regclass\('public\.overtime_requests'\)/g) || []).length)
      .toBeGreaterThanOrEqual(3);
  });
});
