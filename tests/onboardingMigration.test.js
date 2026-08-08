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

describe("migration: onboarding authorization is enforced server-side", () => {
  it("stores the approved list in the database", () => {
    expect(lower).toMatch(/create table if not exists public\.approved_team_logins/);
    expect(lower).toMatch(/insert into public\.approved_team_logins/);
  });

  it("holds all fourteen approved Team Mail IDs", () => {
    const seed = lower.split("insert into public.approved_team_logins")[1].split(";")[0];
    for (const mail of [
      "muhammed.farhan.ext@adbsafegate.com", "anurag.aikkal@adbsafegate.com",
      "amarnath.munderi@adbsafegate.com", "gopakumar.gopinadhan@adbsafegate.com",
      "nisar.ahmed@adbsafegate.com", "jjijosebastian311@gmail.com",
      "nithin.kumar@adbsafegate.com", "praveen6273@gmail.com",
      "jesudaskt22@gmail.com", "prajeshprabhakar002@gmail.com",
      "bv4haris@gmail.com", "ragesh.menon@adbsafegate.com",
      "sanoop.louis@adbsafegate.com", "mohammed.faheem@adbsafegate.com",
    ]) {
      expect(seed).toContain(mail);
    }
  });

  it("does not expose the list to anon or authenticated", () => {
    expect(lower).toMatch(/alter table public\.approved_team_logins enable row level security/);
    expect(lower).toMatch(/revoke all on public\.approved_team_logins from anon, authenticated/);
  });

  it("only a manager may read the list directly", () => {
    expect(lower).toMatch(/create policy atl_select_manager[\s\S]*using \(public\.is_manager\(\)\)/);
  });

  it("exposes a boolean-only RPC that cannot enumerate the team", () => {
    expect(lower).toMatch(/create or replace function public\.is_approved_team_login\(p_email text\)/);
    expect(lower).toMatch(/returns boolean/);
    expect(lower).toMatch(/security definer/);
    expect(lower).toMatch(
      /grant execute on function public\.is_approved_team_login\(text\) to anon, authenticated/);
  });

  it("blocks the Supabase Auth account itself for an unapproved address", () => {
    expect(lower).toMatch(/create trigger trg_guard_auth_user_approved/);
    expect(lower).toMatch(/before insert on auth\.users/);
    expect(lower).toContain("not registered for the team portal");
  });

  it("lets an existing roster member through the auth guard", () => {
    // An address already on the roster keeps working even if it predates the
    // approved list, so applying the migration cannot lock anyone out.
    expect(lower).toMatch(/select 1 from public\.employees where lower\(email\) = lower\(new\.email\)/);
  });

  it("blocks an employee record for an unapproved address", () => {
    expect(lower).toMatch(/create trigger trg_guard_employee_email_approved/);
    expect(lower).toMatch(/before insert or update of email on public\.employees/);
    expect(lower).toContain("is not an approved team mail id");
  });

  it("only judges an email that is actually being changed", () => {
    // Supabase upserts send every column; without this an ordinary profile
    // save would fail for the roster rows still on derived addresses.
    expect(lower).toMatch(/tg_op = 'update' and new\.email is not distinct from old\.email/);
  });

  it("keeps both guard functions off the REST RPC surface", () => {
    expect(lower).toMatch(
      /revoke all on function public\.guard_auth_user_approved\(\) from anon, authenticated/);
    expect(lower).toMatch(
      /revoke all on function public\.guard_employee_email_approved\(\) from anon, authenticated/);
  });
});

describe("migration: auth.users guard covers every onboarding scenario", () => {
  // The trigger body, isolated so assertions cannot accidentally match text
  // from a neighbouring function.
  const body = sql
    .split("create or replace function public.guard_auth_user_approved()")[1]
    .split("$$;")[0]
    .toLowerCase();

  it("approved new Team user — admitted via the approved list", () => {
    expect(body).toMatch(/if public\.is_approved_team_login\(new\.email\) then\s*return new;/);
  });

  it("approved existing Team user — same path, no special case to get wrong", () => {
    // Only INSERT is guarded, so sign-in by an existing account never reaches
    // the trigger at all.
    expect(lower).toMatch(/before insert on auth\.users/);
    expect(lower).not.toMatch(/before insert or update on auth\.users/);
  });

  it("existing roster user without an auth account — admitted", () => {
    expect(body).toMatch(/from public\.employees where lower\(email\) = lower\(new\.email\)/);
    expect(body).toMatch(/return new;/);
  });

  it("the roster lookup is guarded so the trigger is order-independent", () => {
    expect(body).toMatch(/to_regclass\('public\.employees'\) is not null/);
  });

  it("unknown email — refused", () => {
    expect(body).toMatch(/raise exception\s*'this email address is not registered/);
  });

  it("malformed or empty email — passed through, not crashed on", () => {
    // GoTrue validates address format before the insert; the trigger only has
    // to avoid throwing on null/blank (phone-only and anonymous sign-ins).
    expect(body).toMatch(/new\.email is null or trim\(new\.email\) = ''/);
  });

  it("casing and whitespace cannot wrongly refuse a legitimate member", () => {
    const rpc = sql
      .split("create or replace function public.is_approved_team_login(p_email text)")[1]
      .split("$$;")[0]
      .toLowerCase();
    expect(rpc).toMatch(/lower\(email\) = lower\(trim\(coalesce\(p_email, ''\)\)\)/);
  });

  it("fails closed, with a definite errcode rather than a generic one", () => {
    expect(body).toMatch(/errcode = 'check_violation'/);
  });

  it("creates no employee row — it only ever admits or refuses", () => {
    expect(body).not.toMatch(/insert into public\.employees/);
  });

  it("touches no credential material", () => {
    expect(body).not.toMatch(/password|encrypted_password|token/);
  });
});
