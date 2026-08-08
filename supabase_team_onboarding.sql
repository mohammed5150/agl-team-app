-- ===============================================================
-- 11. Team member onboarding — profile self-service and lock
--     (apply AFTER supabase_overtime_bands.sql)
--
--   a) profile_finalized / initial_password transition rules
--   b) employee-editable field allowlist enforced in the database
--   c) profile lock: a finalized profile is read-only to the employee
--   d) unique index on employees.email (login IDs must be unique)
--
-- Passwords are NOT touched here. They live entirely in Supabase Auth;
-- this schema has held no password column since
-- supabase_rls_hardening.sql dropped the legacy plaintext one.
--
-- Idempotent: safe to re-run.
-- ===============================================================

-- ---------------------------------------------------------------
-- a. Email is the login ID, so it must be unique.
--    Case-insensitive: loadPortalData matches on lower(email).
-- ---------------------------------------------------------------

create unique index if not exists employees_email_lower_key
  on public.employees (lower(email))
  where email is not null;

-- ---------------------------------------------------------------
-- b/c. Profile self-service guard
--
-- Applies only to an authenticated end user who is NOT staff, editing
-- their OWN row. Staff (team lead / manager) and trusted backend roles
-- are unaffected, so the existing manager correction workflow keeps
-- working after an employee has locked their profile.
--
-- Rules enforced:
--   1. A finalized profile is read-only — no employee-editable field
--      may change once profile_finalized is true.
--   2. profile_finalized may only go false -> true (self-finalize).
--      An employee can never set it back to false; only a manager can
--      reopen a profile.
--   3. initial_password may only go true -> false, and only as a side
--      effect of the employee setting their own password. It can never
--      be re-armed by the employee.
--   4. Every column outside the employee-editable allowlist must be
--      unchanged. This covers designation, section, emp_no, shift,
--      leave balances, rating, warnings, achievements, actions,
--      training and roster, on top of the role/tier/id/email and
--      band/airport/supplier already guarded by earlier migrations.
-- ---------------------------------------------------------------

create or replace function public.guard_employee_profile_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted backend roles (service_role / SQL editor) bypass entirely.
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return new;
  end if;

  -- Staff keep full management access, including corrections after lock.
  if public.is_staff() then
    return new;
  end if;

  -- Beyond this point: a non-staff employee. They may only touch their own
  -- row at all (emp_update_self already enforces that; belt and braces).
  if old.id is distinct from public.current_emp_id() then
    raise exception 'You may only edit your own profile';
  end if;

  -- Rule 2 — finalization is one-way for an employee.
  if old.profile_finalized and not new.profile_finalized then
    raise exception
      'A finalized profile can only be reopened by a manager';
  end if;

  -- Rule 3 — the initial-password flag is one-way too.
  if new.initial_password and not old.initial_password then
    raise exception 'The initial password flag cannot be re-armed';
  end if;

  -- Rule 1 — a finalized profile is read-only to its owner. Compare the
  -- editable set; anything else is caught by rule 4 below regardless.
  if old.profile_finalized then
    if (new.name             is distinct from old.name
        or new.nationality      is distinct from old.nationality
        or new.mobile           is distinct from old.mobile
        or new.dob              is distinct from old.dob
        or new.marital_status   is distinct from old.marital_status
        or new.address          is distinct from old.address
        or new.emergency_name   is distinct from old.emergency_name
        or new.emergency_contact is distinct from old.emergency_contact
        or new.passport_no      is distinct from old.passport_no
        or new.passport_expiry  is distinct from old.passport_expiry
        or new.visa_expiry      is distinct from old.visa_expiry
        or new.eid_no           is distinct from old.eid_no
        or new.eid_expiry       is distinct from old.eid_expiry
        or new.documents        is distinct from old.documents) then
      raise exception
        'Your profile is finalized. Ask a manager to make corrections.';
    end if;
  end if;

  -- Rule 4 — everything outside the employee-editable allowlist is frozen.
  -- (role, tier, id and email are additionally guarded by
  --  guard_employee_privileges; band/airport/supplier by
  --  guard_employee_grading. Repeated here so the allowlist is complete
  --  and self-describing.)
  if (new.id            is distinct from old.id
      or new.email         is distinct from old.email
      or new.role          is distinct from old.role
      or new.tier          is distinct from old.tier
      or new.band          is distinct from old.band
      or new.airport       is distinct from old.airport
      or new.supplier      is distinct from old.supplier
      or new.designation   is distinct from old.designation
      or new.section       is distinct from old.section
      or new.emp_no        is distinct from old.emp_no
      or new.shift         is distinct from old.shift
      or new.annual_leave  is distinct from old.annual_leave
      or new.used_annual   is distinct from old.used_annual
      or new.sick_leave    is distinct from old.sick_leave
      or new.used_sick     is distinct from old.used_sick
      or new.comp_off      is distinct from old.comp_off
      or new.rating        is distinct from old.rating
      or new.warnings      is distinct from old.warnings
      or new.achievements  is distinct from old.achievements
      or new.actions       is distinct from old.actions
      or new.training      is distinct from old.training
      or new.roster        is distinct from old.roster) then
    raise exception
      'That field is managed by your team lead or manager';
  end if;

  return new;
end;
$$;

-- Runs after the earlier guards (alphabetical firing order on the same
-- event: trg_guard_employee_grading, trg_guard_employee_privileges, then
-- trg_guard_employee_profile_lock). Any one of them raising is enough.
drop trigger if exists trg_guard_employee_profile_lock on public.employees;
create trigger trg_guard_employee_profile_lock
  before update on public.employees
  for each row execute function public.guard_employee_profile_lock();

revoke all on function public.guard_employee_profile_lock() from anon, authenticated;

-- ---------------------------------------------------------------
-- d. An employee may not create or delete employee rows. Already true
--    (emp_insert_manager / emp_delete_manager), asserted here so the
--    onboarding surface is fully described in one migration.
-- ---------------------------------------------------------------

-- No change required; documented for reviewers.

comment on function public.guard_employee_profile_lock() is
  'Team onboarding: enforces the employee-editable field allowlist, one-way '
  'profile finalization, one-way initial-password clearing, and read-only '
  'locking of a finalized profile. Staff and backend roles bypass.';
