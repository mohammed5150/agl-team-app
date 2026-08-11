import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// guard_request_immutable() freezes the substance of a request once it has
// been submitted, and it is attached to BOTH leave_requests and
// overtime_requests. Those two tables do not share a column list: leave has
// start_date / end_date / days / type, overtime has work_date / hours.
//
// The original version in supabase_rls_hardening.sql named the leave columns
// directly. PL/pgSQL resolves `new.start_date` at runtime against the actual
// record, so on overtime_requests the trigger raised
//
//     ERROR 42703: record "new" has no field "start_date"
//
// The function returns early for "the requester editing their own still
// pending row", so submitting and withdrawing overtime kept working. The only
// path that reached the frozen-column check on that table was somebody other
// than the requester updating it — which on overtime_requests is exactly, and
// only, the team lead approving or rejecting. The single code path that hit
// the bug was the whole approval stage, which is why it survived unnoticed.
//
// These assertions keep the guard table-aware.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fix = readFileSync(join(ROOT, "supabase_overtime_guard_fix.sql"), "utf8").toLowerCase();
const bands = readFileSync(join(ROOT, "supabase_overtime_bands.sql"), "utf8").toLowerCase();

// The frozen-column list the fix selects per table.
function frozenFor(table) {
  const m = fix.match(new RegExp(`when '${table}'\\s*then\\s*array\\[([^\\]]*)\\]`));
  return m ? m[1] : null;
}

describe("the immutability guard is shared by two tables with different columns", () => {
  it("is still attached to overtime_requests — the reason it must be table-aware", () => {
    expect(bands).toMatch(/create trigger trg_guard_overtime_immutable/);
    expect(bands).toMatch(/execute function public\.guard_request_immutable\(\)/);
  });

  it("chooses the frozen columns from the table being updated", () => {
    expect(fix).toContain("case tg_table_name");
  });

  it("freezes leave by its own columns", () => {
    const cols = frozenFor("leave_requests");
    expect(cols).not.toBeNull();
    for (const c of ["emp_id", "start_date", "end_date", "days", "type", "reason"]) {
      expect(cols).toContain(`'${c}'`);
    }
  });

  it("freezes overtime by ITS columns, never leave's", () => {
    const cols = frozenFor("overtime_requests");
    expect(cols).not.toBeNull();
    for (const c of ["emp_id", "work_date", "hours", "reason"]) {
      expect(cols).toContain(`'${c}'`);
    }
    // The actual bug: leave-only columns referenced while updating overtime.
    for (const c of ["start_date", "end_date", "days", "type"]) {
      expect(cols).not.toContain(`'${c}'`);
    }
  });

  it("leaves the approving team lead's own fields writable", () => {
    // status, tl_comment, tl_action_date and tl_name are what approval writes.
    // Freezing any of them would break the stage this migration exists to fix.
    const cols = frozenFor("overtime_requests");
    for (const c of ["status", "tl_comment", "tl_action_date", "tl_name"]) {
      expect(cols).not.toContain(`'${c}'`);
    }
  });

  it("compares through jsonb so a missing column cannot raise 42703", () => {
    expect(fix).toMatch(/to_jsonb\(old\)/);
    expect(fix).toMatch(/to_jsonb\(new\)/);
    // Only the executable body counts here. The header comment quotes the
    // original broken code on purpose, to record what went wrong, so matching
    // against the whole file would fail on the documentation.
    const body = fix.slice(fix.indexOf("as $$"), fix.lastIndexOf("$$;"));
    expect(body).not.toMatch(/new\.start_date/);
    expect(body).not.toMatch(/new\.end_date/);
    expect(body).not.toMatch(/new\.days/);
  });

  it("falls back to freezing emp_id for any table added later", () => {
    expect(fix).toMatch(/else\s*array\['emp_id'\]/);
  });

  it("keeps the trigger function off the public API", () => {
    expect(fix).toMatch(/revoke all on function public\.guard_request_immutable\(\) from anon, authenticated/);
  });
});
