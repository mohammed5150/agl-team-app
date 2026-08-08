import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MANAGEMENT_FIELDS, EMPLOYEE_EDITABLE_FIELDS } from "../src/onboarding.js";

// The database is the security boundary, not the React layer. These assertions
// pin the guarantees the migration must keep providing, so a later edit that
// silently drops one fails the suite instead of shipping a hole.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(ROOT, "supabase_team_onboarding.sql"), "utf8");
const lower = sql.toLowerCase();

// camelCase app field -> snake_case column
const col = f => f.replace(/[A-Z]/g, c => "_" + c.toLowerCase());

describe("migration: login IDs are unique", () => {
  it("adds a case-insensitive unique index on email", () => {
    expect(lower).toMatch(/create unique index[\s\S]*lower\(email\)/);
  });
});

describe("migration: the lock cannot be bypassed via the API", () => {
  it("installs a BEFORE UPDATE trigger on employees", () => {
    expect(lower).toMatch(/create trigger trg_guard_employee_profile_lock/);
    expect(lower).toMatch(/before update on public\.employees/);
  });

  it("blocks an employee reverting profile_finalized to false", () => {
    expect(lower).toMatch(/old\.profile_finalized and not new\.profile_finalized/);
    expect(lower).toContain("can only be reopened by a manager");
  });

  it("blocks edits to a finalized profile", () => {
    expect(lower).toContain("your profile is finalized");
  });

  it("blocks re-arming the initial password flag", () => {
    expect(lower).toMatch(/new\.initial_password and not old\.initial_password/);
  });

  it("blocks editing another employee's row", () => {
    expect(lower).toContain("you may only edit your own profile");
  });

  it("lets staff and backend roles through, so manager corrections still work", () => {
    expect(lower).toMatch(/if public\.is_staff\(\) then\s*return new;/);
    expect(lower).toMatch(/coalesce\(auth\.role\(\), 'service_role'\) <> 'authenticated'/);
  });

  it("is not callable over the REST RPC surface", () => {
    expect(lower).toMatch(
      /revoke all on function public\.guard_employee_profile_lock\(\) from anon, authenticated/);
  });
});

describe("migration: every management field is frozen for employees", () => {
  // profileFinalized has its own dedicated one-way rule above.
  const guarded = MANAGEMENT_FIELDS.filter(f => f !== "profileFinalized");

  it.each(guarded)("freezes %s", field => {
    const c = col(field);
    expect(lower).toMatch(new RegExp(`new\\.${c}\\s+is distinct from old\\.${c}`));
  });

  it("names the whole set in a single guard clause", () => {
    expect(lower).toContain("managed by your team lead or manager");
  });
});

describe("migration: employee-editable fields are covered by the lock check", () => {
  it.each(EMPLOYEE_EDITABLE_FIELDS)("locks %s once finalized", field => {
    const c = col(field);
    expect(lower).toMatch(new RegExp(`new\\.${c}\\s+is distinct from old\\.${c}`));
  });
});

describe("migration: team mail mapping is safe and incomplete by design", () => {
  it("maps the twelve confirmed Team Mail IDs", () => {
    for (const mail of [
      "muhammed.farhan.ext@adbsafegate.com",
      "anurag.aikkal@adbsafegate.com",
      "amarnath.munderi@adbsafegate.com",
      "gopakumar.gopinadhan@adbsafegate.com",
      "nisar.ahmed@adbsafegate.com",
      "nithin.kumar@adbsafegate.com",
      "jesudaskt22@gmail.com",
      "prajeshprabhakar002@gmail.com",
      "bv4haris@gmail.com",
      "ragesh.menon@adbsafegate.com",
      "sanoop.louis@adbsafegate.com",
      "mohammed.faheem@adbsafegate.com",
    ]) {
      expect(lower).toContain(mail);
    }
  });

  it("does NOT map the two unresolved addresses", () => {
    // Present only as documentation of why they are excluded, never inside
    // the VALUES list that drives the UPDATE.
    const updateBlock = lower.split("for m in")[1] || "";
    const values = updateBlock.split("loop")[0] || "";
    expect(values).not.toContain("praveen6273@gmail.com");
    expect(values).not.toContain("jjijosebastian311@gmail.com");
  });

  it("explains the ambiguity so the gap is not mistaken for an omission", () => {
    expect(lower).toContain("unresolved");
    expect(lower).toContain("praveen6273@gmail.com");
    expect(lower).toContain("jjijosebastian311@gmail.com");
  });

  it("never adds Dhanesh", () => {
    expect(lower).not.toContain("dhanesh");
  });

  it("skips a mapping that would collide with another employee", () => {
    expect(lower).toMatch(/already held by another employee/);
  });
});

describe("migration: no credential handling", () => {
  it("creates no password column and stores no plaintext", () => {
    expect(lower).not.toMatch(/add column[^;]*password[^;]*text/);
    expect(lower).not.toMatch(/password_hash/);
    expect(lower).toContain("supabase auth");
  });
});
